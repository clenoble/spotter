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
import {
  runDigestNow,
  readDigest,
  digestDays,
  digestIsStale,
  recordOpenGesture,
  recordReadGesture,
  recordRunError,
  clearRunError,
  surfaceInterruptedRun,
  ATTEMPT_KEY
} from '$lib/digest-host';
import { probeCompanion, createCompanionClient } from '$lib/companion-client';
import type {
  ScoreRequest,
  ScoreResponse,
  LogRequest,
  ChatRequest,
  ChatResponse,
  LabelRequest,
  LabelResponse,
  DigestRunRequest,
  DigestCancelRequest,
  DigestCancelResponse,
  DigestGetRequest,
  DigestOpenRequest,
  DigestReadRequest,
  DigestDayRequest,
  DigestDaysRequest,
  DigestRunResponse,
  DigestGetResponse,
  DigestDaysResponse,
  GestureResponse,
  DeclarationsChangedRequest,
  DeclarationsPushResponse
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
//
// `runInfo` is the visible witness (Céline, 2026-08-19). In memory on purpose:
// it is true exactly as long as the promise it describes exists. A stored flag
// would outlive a crashed run and say "searching" forever.
let digestRunning: Promise<void> | null = null;
let runInfo: { startedAt: string; tier: 'overnight' | 'staleness' | 'manual' } | null = null;
// The local half of the Stop button. Lives and dies with the worker, exactly
// like the run it stops.
let cancelLocalRun = false;

function startDigest(tier: 'overnight' | 'staleness' | 'manual'): Promise<void> {
  if (!digestRunning) {
    runInfo = { startedAt: new Date().toISOString(), tier };
    cancelLocalRun = false;
    void chrome.storage.local.set({ [ATTEMPT_KEY]: { at: runInfo.startedAt, tier } });
    digestRunning = clearRunError()
      .then(() => runDigestNow(tier, () => cancelLocalRun))
      .then(() => undefined)
      .catch(async err => {
        // A failure only the worker's console sees is invisible to the one
        // person who needs it. Record it where the dashboard reads.
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[spotter:sw] digest run failed:', message);
        await recordRunError(tier, message);
      })
      .then(() => {
        digestRunning = null;
        runInfo = null;
      });
  }
  return digestRunning;
}

const withRunState = (view: Awaited<ReturnType<typeof readDigest>>) => ({
  ...view,
  runInProgress: runInfo,
  servedBy: 'extension' as const
});

// --- the companion switchover (host #3) --------------------------------------
//
// When a companion answers /health, the extension stands down as producer and
// proxies reads, gestures and runs to it. Probed with a short cache so a
// stopped companion degrades to local production within a minute, not a
// restart. Standalone-first (§6): every path below falls back to local.
let companionSeen: { at: number; client: ReturnType<typeof createCompanionClient> | null } = {
  at: 0,
  client: null
};

async function companion(): Promise<ReturnType<typeof createCompanionClient> | null> {
  if (Date.now() - companionSeen.at < 60_000) return companionSeen.client;
  const s = settings ?? (settings = await getSettings());
  const url = s.companionUrl ?? 'http://localhost:8787';
  const paired = !!s.companionToken;
  const client =
    paired && (await probeCompanion(url)) ? createCompanionClient(url, s.companionToken ?? '') : null;
  companionSeen = { at: Date.now(), client };
  return client;
}

/**
 * Push the user's declarations to the companion — on her explicit save, and
 * reconciled on wake. Returns what happened rather than swallowing it: the
 * first version returned void, skipped silently when the companion was not
 * yet probed with its token, and Céline's edits never arrived — an invisible
 * non-push, same disease as every silent failure this week.
 */
async function pushDeclarations(): Promise<{ pushed: boolean; detail: string }> {
  const s = settings ?? (settings = await getSettings());
  if (!s.companionToken) return { pushed: false, detail: 'no companion paired (no token in Preferences)' };
  const client = await companion();
  if (!client) return { pushed: false, detail: `companion not reachable at ${s.companionUrl}` };
  try {
    await client.pushDeclarations(await effectivePrefs(), s);
    return { pushed: true, detail: 'declarations pushed to the companion' };
  } catch (err) {
    return { pushed: false, detail: `push failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
void pushDeclarations().then(r => {
  if (!r.pushed) console.log('[spotter:sw] wake reconcile:', r.detail);
});

/**
 * May an automatic tier fire? Two guards, both measured live (2026-08-19):
 *
 * - **A paired companion owns production.** The extension's tiers stand down
 *   entirely — a reload was launching a local run while the companion sat
 *   there as the designated producer.
 * - **One attempt per day, success or failure.** The staleness check compared
 *   against the last *successful* run, so a failed run made every worker wake
 *   retry — a run relaunched itself on reload straight after erroring. An
 *   error waits for the reader's explicit button or for tomorrow; the error
 *   banner says why.
 */
async function autoTierMayFire(): Promise<boolean> {
  if (await companion()) return false;
  const attempt = (await chrome.storage.local.get(ATTEMPT_KEY))[ATTEMPT_KEY] as { at: string } | undefined;
  if (attempt && attempt.at.slice(0, 10) === new Date().toISOString().slice(0, 10)) return false;
  return digestIsStale();
}


chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'spotter:overnight') {
    void autoTierMayFire().then(may => {
      if (may) void startDigest('overnight');
    });
  }
});

// Tier 2: on any wake of the worker, run if today has seen no attempt yet.
// Non-blocking by construction: nothing awaits it, and the dashboard
// announces the result when it lands. The interrupted-run check goes FIRST:
// an attempt the dead worker left behind must get its banner before any new
// tier decides whether to fire.
void surfaceInterruptedRun()
  .then(() => autoTierMayFire())
  .then(may => {
    if (may) void startDigest('staleness');
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
  // A settings change can be the pairing itself (token pasted). A cached
  // "no companion" verdict from before the token existed would swallow the
  // next push silently — measured live by Céline, 2026-08-19.
  companionSeen = { at: 0, client: null };
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
    // Tier 3 — the explicit control. Starts the run and answers IMMEDIATELY
    // with the run state: a digest takes tens of minutes, a message channel
    // does not live that long, and the dashboard follows progress by polling.
    companion()
      .then(async client => {
        if (client) {
          await client.postRun();
          return { ...(await client.getDigest()), servedBy: 'companion' as const };
        }
        void startDigest('manual');
        return withRunState(await readDigest());
      })
      .then(view => sendResponse({ ok: true, view } satisfies DigestRunResponse))
      .catch(err => sendResponse({ ok: false, error: String(err) } satisfies DigestRunResponse));
    return true;
  }
  if (isDigestCancel(msg)) {
    // Stop whichever producer is producing. The flag (or the companion's)
    // is polled at candidate boundaries, so the stop lands within minutes —
    // and `cancelling: false` honestly says there was nothing to stop.
    companion()
      .then(async client => {
        if (client) return client.postCancel();
        const live = digestRunning != null;
        if (live) cancelLocalRun = true;
        return live;
      })
      .then(cancelling => sendResponse({ ok: true, cancelling } satisfies DigestCancelResponse))
      .catch(err => sendResponse({ ok: false, error: String(err) } satisfies DigestCancelResponse));
    return true;
  }
  if (isDigestGet(msg) || isDigestDay(msg)) {
    const day = isDigestDay(msg) ? msg.day : undefined;
    companion()
      .then(async client =>
        client
          ? { ...(await client.getDigest(day)), servedBy: 'companion' as const }
          : withRunState(await readDigest(day))
      )
      .then(view => sendResponse({ ok: true, view } satisfies DigestGetResponse))
      .catch(err => sendResponse({ ok: false, error: String(err) } satisfies DigestGetResponse));
    return true;
  }
  if (isDigestDays(msg)) {
    companion()
      .then(client => (client ? client.getDays() : digestDays()))
      .then(days => sendResponse({ ok: true, days } satisfies DigestDaysResponse))
      .catch(err => sendResponse({ ok: false, error: String(err) } satisfies DigestDaysResponse));
    return true;
  }
  if (isDigestOpen(msg) || isDigestRead(msg)) {
    const kind = isDigestOpen(msg) ? ('open' as const) : ('read' as const);
    companion()
      .then(client => {
        if (client) return client.postGesture(msg.documentId, kind);
        return kind === 'open' ? recordOpenGesture(msg.documentId) : recordReadGesture(msg.documentId);
      })
      .then(() => sendResponse({ ok: true } satisfies GestureResponse))
      .catch(err => sendResponse({ ok: false, error: String(err) } satisfies GestureResponse));
    return true;
  }
  if (isDeclarationsChanged(msg)) {
    // Answers with what actually happened — the save button shows it.
    pushDeclarations()
      .then(r => sendResponse({ ok: true, ...r } satisfies DeclarationsPushResponse))
      .catch(err => sendResponse({ ok: false, error: String(err) } satisfies DeclarationsPushResponse));
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
function isDigestCancel(msg: unknown): msg is DigestCancelRequest {
  return hasType(msg, 'spotter:digest-cancel');
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
function isDigestDay(msg: unknown): msg is DigestDayRequest {
  return hasType(msg, 'spotter:digest-day') && /^\d{4}-\d{2}-\d{2}$/.test(String((msg as DigestDayRequest).day));
}
function isDigestDays(msg: unknown): msg is DigestDaysRequest {
  return hasType(msg, 'spotter:digest-days');
}
function isDeclarationsChanged(msg: unknown): msg is DeclarationsChangedRequest {
  return hasType(msg, 'spotter:declarations-changed');
}
