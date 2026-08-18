import { scorePost } from '$lib/llm/fast';
import { summarize, chatForPreferenceEdit } from '$lib/llm/analyst';
import { recordConsumption, getPreferences, putEvalLabel } from '$lib/store/db';
import { BOOTSTRAP_PREFERENCES, hasAnyPrefs } from '$lib/preference/schema';
import { createProvider } from '$core/index';
import type { LlmProvider } from '$core/llm/provider';
import {
  getSettings,
  onSettingsChanged,
  settingsProblem,
  toProviderConfig,
  type BackendSettings
} from '$lib/settings';
import { runDigestNow, readDigest, digestIsStale, recordOpenGesture, recordReadGesture } from '$lib/digest-host';
import type {
  ScoreRequest,
  ScoreResponse,
  LogRequest,
  ChatRequest,
  ChatResponse,
  LabelRequest,
  LabelResponse,
  DigestRunRequest,
  DigestGetRequest,
  DigestOpenRequest,
  DigestReadRequest,
  DigestRunResponse,
  DigestGetResponse,
  GestureResponse
} from '$shared/messages';
import type { ConsumptionLogEntry, PreferenceDoc } from '$shared/types';

chrome.runtime.onInstalled.addListener(() => {
  console.log('[spotter] installed');
  // Tier 1 of §5.5: overnight, if the browser is alive to fire it. The two
  // fallback tiers below are why this is not a promise.
  chrome.alarms.create('spotter:overnight', { when: nextTime(3, 30), periodInMinutes: 24 * 60 });
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') });
});

function nextTime(hour: number, minute: number): number {
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

// One digest at a time: the alarm, the staleness check and the button can all
// fire close together (§5.5 tier 2 *is* "the worker just woke up"), and two
// concurrent runs would double every LLM call and write duplicate offers.
let digestRunning: Promise<void> | null = null;

function startDigest(tier: 'overnight' | 'staleness' | 'manual'): Promise<void> {
  if (!digestRunning) {
    digestRunning = runDigestNow(tier)
      .catch(err => console.warn('[spotter:sw] digest run failed:', err))
      .then(() => {
        digestRunning = null;
      });
  }
  return digestRunning;
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'spotter:overnight') void startDigest('overnight');
});

// Tier 2: on any wake of the worker, run if today has no digest yet. More
// reliable than the alarm, not less — it depends only on the user showing up,
// which they must do to read the digest at all. Non-blocking by construction:
// nothing awaits it, and the dashboard announces the result when it lands.
void digestIsStale().then(stale => {
  if (stale) void startDigest('staleness');
});

// Composition root: the host builds the LLM backend from the user's settings
// and injects it into the engine. Rebuilt on every settings change, so a new
// key or model takes effect on the next scored post without a reload. The
// per-axis split (spec §6.1, F6) becomes a map here rather than a single value.
let settings: BackendSettings | null = null;
let provider: LlmProvider | null = null;

async function backend(): Promise<{ provider: LlmProvider; model: string }> {
  if (!settings) settings = await getSettings();
  const problem = settingsProblem(settings);
  if (problem) throw new Error(problem);
  if (!provider) provider = createProvider(toProviderConfig(settings));
  return { provider, model: settings.model };
}

onSettingsChanged(next => {
  settings = next;
  provider = null; // rebuilt lazily on the next job
  console.log('[spotter:sw] backend is now', next.provider, next.model);
});

async function effectivePrefs(): Promise<PreferenceDoc> {
  const saved = await getPreferences();
  return hasAnyPrefs(saved) ? saved : BOOTSTRAP_PREFERENCES;
}

type ScoreJob = {
  kind: 'score';
  req: ScoreRequest;
  sendResponse: (r: ScoreResponse) => void;
};
type ChatJob = {
  kind: 'chat';
  req: ChatRequest;
  sendResponse: (r: ChatResponse) => void;
};
type LogJob = { kind: 'log'; req: LogRequest };
type Job = ScoreJob | ChatJob | LogJob;

const queue: Job[] = [];
let processing = false;

// Score + chat are user-facing (badge latency, chat response). Log is
// background summarization that can wait. Dequeue any score or chat
// before any log.
function dequeue(): Job | undefined {
  const idx = queue.findIndex(j => j.kind === 'score' || j.kind === 'chat');
  if (idx >= 0) return queue.splice(idx, 1)[0];
  return queue.shift();
}

async function drain(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    while (queue.length) {
      const job = dequeue();
      if (!job) break;
      if (job.kind === 'score') await runScore(job);
      else if (job.kind === 'chat') await runChat(job);
      else await runLog(job);
    }
  } finally {
    processing = false;
  }
}

async function runScore(job: ScoreJob): Promise<void> {
  try {
    const prefs = await effectivePrefs();
    const { provider: llm, model } = await backend();
    const result = await scorePost(job.req.post, prefs, llm, model);
    job.sendResponse({ ok: true, result });
  } catch (err) {
    job.sendResponse({
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

async function runChat(job: ChatJob): Promise<void> {
  try {
    const currentPrefs = await effectivePrefs();
    const { reply, ops } = await chatForPreferenceEdit(
      job.req.history,
      currentPrefs
    );
    job.sendResponse({ ok: true, reply, ops, currentPrefs });
  } catch (err) {
    job.sendResponse({
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

async function runLog(job: LogJob): Promise<void> {
  try {
    const summary = await summarize({
      authorName: job.req.post.authorName,
      text: job.req.post.text
    });
    const entry: ConsumptionLogEntry = {
      postId: job.req.post.id,
      platform: job.req.post.platform,
      authorHandle: job.req.post.authorHandle,
      seenAt: job.req.seenAt,
      dwellMs: job.req.dwellMs,
      engagement: job.req.engagement,
      summary,
      rankScore: job.req.rank.score,
      rankReason: job.req.rank.reason,
      rankContribution: job.req.rank.contribution,
      rankGate: job.req.rank.gate,
      rankAxes: job.req.rank.axes,
      rankDegraded: job.req.rank.degraded
    };
    await recordConsumption(entry);
  } catch (err) {
    console.warn('[spotter:sw] log job failed for', job.req.post.id, err);
  }
}

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  if (isDigestRun(msg)) {
    // Tier 3 — the explicit control. Waits for the run (unlike tier 2),
    // because the user asked and is watching.
    startDigest('manual')
      .then(() => readDigest())
      .then(view => sendResponse({ ok: true, view } satisfies DigestRunResponse))
      .catch(err => sendResponse({ ok: false, error: String(err) } satisfies DigestRunResponse));
    return true;
  }
  if (isDigestGet(msg)) {
    readDigest()
      .then(view => sendResponse({ ok: true, view } satisfies DigestGetResponse))
      .catch(err => sendResponse({ ok: false, error: String(err) } satisfies DigestGetResponse));
    return true;
  }
  if (isDigestOpen(msg)) {
    recordOpenGesture(msg.documentId)
      .then(() => sendResponse({ ok: true } satisfies GestureResponse))
      .catch(err => sendResponse({ ok: false, error: String(err) } satisfies GestureResponse));
    return true;
  }
  if (isDigestRead(msg)) {
    recordReadGesture(msg.documentId)
      .then(() => sendResponse({ ok: true } satisfies GestureResponse))
      .catch(err => sendResponse({ ok: false, error: String(err) } satisfies GestureResponse));
    return true;
  }
  if (isLabelRequest(msg)) {
    // No LLM involved — persist directly, skip the queue.
    putEvalLabel(msg.entry)
      .then(() => sendResponse({ ok: true } satisfies LabelResponse))
      .catch(err =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        } satisfies LabelResponse)
      );
    return true;
  }
  if (isScoreRequest(msg)) {
    queue.push({ kind: 'score', req: msg, sendResponse });
    void drain();
    return true;
  }
  if (isChatRequest(msg)) {
    queue.push({ kind: 'chat', req: msg, sendResponse });
    void drain();
    return true;
  }
  if (isLogRequest(msg)) {
    queue.push({ kind: 'log', req: msg });
    void drain();
    sendResponse({ ok: true });
    return false;
  }
  return undefined;
});

function hasType(msg: unknown, type: string): boolean {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === type
  );
}

function isScoreRequest(msg: unknown): msg is ScoreRequest {
  return hasType(msg, 'spotter:score');
}
function isChatRequest(msg: unknown): msg is ChatRequest {
  return hasType(msg, 'spotter:chat');
}
function isLogRequest(msg: unknown): msg is LogRequest {
  return hasType(msg, 'spotter:log');
}
function isLabelRequest(msg: unknown): msg is LabelRequest {
  return hasType(msg, 'spotter:label');
}
function isDigestRun(msg: unknown): msg is DigestRunRequest {
  return hasType(msg, 'spotter:digest-run');
}
function isDigestGet(msg: unknown): msg is DigestGetRequest {
  return hasType(msg, 'spotter:digest-get');
}
function isDigestOpen(msg: unknown): msg is DigestOpenRequest {
  return hasType(msg, 'spotter:digest-open') && typeof (msg as DigestOpenRequest).documentId === 'string';
}
function isDigestRead(msg: unknown): msg is DigestReadRequest {
  return hasType(msg, 'spotter:digest-read') && typeof (msg as DigestReadRequest).documentId === 'string';
}
