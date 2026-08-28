import type { LlmProvider } from './llm/provider';
import type { EditorialCandidate, EditorialContext, EditorialDecision } from './editorial';

/**
 * The editor's voice — the LLM call that produces `EditorialDecision`s.
 *
 * Everything protective lives **outside** this file, on purpose. The assembly
 * (`assembleEditorial`) guarantees that every candidate appears exactly once,
 * that silence becomes `unruled` rather than an invented verdict, and that the
 * ceiling is never a quota — so this judge can be *wrong* or *mute* without
 * anything vanishing. A judge trusted with those properties would eventually
 * drop one, and the loss would be invisible by construction (§5.6).
 *
 * The default model is the analyst tier, not the fast one: this call runs once
 * per digest on a slate of ten to twenty, overnight, where §5.5 dissolved the
 * latency constraint. Spending the better model here is free.
 */
const JUDGE_MODEL = 'qwen2.5:7b';

const SYSTEM = `You are a librarian compiling a specialised press review for ONE named reader. From the day's candidates, decide which few genuinely deserve their attention TODAY.

You are not ranking quality — that is already scored. You judge the SLATE: what does this reader gain from today's selection as a whole?

Rules you apply:
- A superb piece whose substance repeats something recently offered does NOT run. The reader has had it.
- A middling piece on a subject absent from their desk for months CAN be raised. Absence is a reason.
- A piece marked degraded (a safety axis could not check it) may still run, but only if it clearly earns the slot over checked alternatives — say so in your reason.
- Fewer is better. An empty selection is acceptable on a thin day. NEVER select to fill.

For EVERY candidate id, return a decision. If you refuse one, give the actual reason ("repeats X from Tuesday", "fourth take on the same story today") — the reason is shown to the reader. If you select one, say why it earns the slot.

For every decision, also name the SUBJECT: what the piece is about, in a few plain words (the work, the story, the question — e.g. "Hegel's Elements of the Philosophy of Right", "EU AI Act enforcement"). Two pieces about the same thing get the SAME subject wording. At most ONE selection per subject is kept — this is enforced mechanically after your answer, so selecting several takes on one subject only discards your weaker picks.

Output ONLY valid JSON: {"decisions": [{"id": "...", "select": true/false, "reason": "one sentence", "subject": "a few words"}]}.`;

const SCHEMA = {
  type: 'object',
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          select: { type: 'boolean' },
          reason: { type: 'string' },
          subject: { type: 'string' }
        },
        required: ['id', 'select', 'reason', 'subject'],
        additionalProperties: false
      }
    }
  },
  required: ['decisions'],
  additionalProperties: false
} as const;

export interface EditorialJudgeOptions {
  model?: string;
  maxItems: number;
}

/**
 * Ask the editor. Returns whatever decisions could be parsed — the assembly
 * turns anything missing into `unruled`, so a partial or garbled answer
 * degrades to visible non-verdicts rather than to invented ones.
 */
export async function judgeSlate(
  provider: LlmProvider,
  candidates: readonly EditorialCandidate[],
  context: readonly EditorialContext[],
  options: EditorialJudgeOptions
): Promise<EditorialDecision[]> {
  if (candidates.length === 0) return [];

  const byId = new Map(context.map(c => [c.documentId, c]));
  const slate = candidates
    .map(c => {
      const ctx = byId.get(c.documentId);
      const facts = [
        `score ${c.score.toFixed(0)}`,
        c.degraded ? `DEGRADED (unchecked: ${c.ungatedAxes.join(', ') || 'unknown'})` : '',
        ctx?.everProposed ? `offered before (last ${ctx.lastProposedAt ?? '?'})` : 'never offered',
        ctx?.subjectLastSeen ? `subject last seen ${ctx.subjectLastSeen}` : 'subject never seen'
      ]
        .filter(Boolean)
        .join(' · ');
      return `id: ${c.documentId}\n  ${c.title}\n  ${facts}`;
    })
    .join('\n\n');

  const raw = await provider.generate(
    `Select AT MOST ${options.maxItems} of these ${candidates.length} candidates.\n\n${slate}`,
    {
      model: options.model ?? JUDGE_MODEL,
      system: SYSTEM,
      temperature: 0.2,
      maxTokens: 220 + candidates.length * 60,
      jsonSchema: SCHEMA as unknown as Record<string, unknown>
    }
  );

  return parseDecisions(raw, new Set(candidates.map(c => c.documentId)));
}

/**
 * Motivate every refusal — one forced call per unselected candidate.
 *
 * *Added 2026-08-19, after the first validation run and Céline's correction of
 * how its result was read.* The slate call asked for a decision on every id
 * and the local judge ruled only on what it selected: all ten held-back items
 * came back `unruled`. That is the measured phenomenon from next door — **an
 * instruction whose execution depends on a decision does not execute** — and
 * the sentence is a *diagnosis*, not a license: their fix was to make the
 * gesture unavoidable (`tool_choice: any` → 9/9), never to ask more nicely.
 *
 * Same move here. A call **about one candidate** cannot stay silent about it:
 * the model is asked one question whose only answer is the reason this
 * candidate did not earn a slot. Silence stops being an available output —
 * `unruled` survives only as the honest record of a call that *errored*, and
 * the invariants assert exactly that.
 *
 * Cost: one small call per unselected slate candidate (~10 per digest),
 * overnight, where §5.5 dissolved the latency constraint.
 */
export async function motivateRefusals(
  provider: LlmProvider,
  unselected: readonly EditorialCandidate[],
  selected: readonly { title: string; reason: string }[],
  options: { model?: string }
): Promise<EditorialDecision[]> {
  const slate = selected.length
    ? `Today's selection was:\n${selected.map(s => `- ${s.title} (${s.reason})`).join('\n')}`
    : `Nothing was selected today — the slate was thin.`;

  const out: EditorialDecision[] = [];
  for (const c of unselected) {
    const raw = await provider.generate(
      `${slate}\n\nThis candidate was examined and NOT selected:\n  ${c.title}\n  (score ${c.score.toFixed(0)}${c.degraded ? ', degraded' : ''})\n\nState the actual reason it did not earn a slot today — redundancy with the selection, weaker than a selected item on the same subject, off the reader's declared interests, thin substance. One sentence, shown to the reader.`,
      {
        model: options.model ?? JUDGE_MODEL,
        system:
          'You are the librarian who just compiled a press review. You explain, in one plain sentence, why one examined candidate was not included. Output ONLY valid JSON: {"reason": "one sentence"}.',
        temperature: 0.2,
        maxTokens: 90,
        jsonSchema: {
          type: 'object',
          properties: { reason: { type: 'string' } },
          required: ['reason'],
          additionalProperties: false
        }
      }
    ).catch(() => '');

    const reason = parseReason(raw);
    // No reason extracted = the call failed = genuinely unruled. Omitting the
    // decision (rather than inventing a reason) is what keeps that visible.
    if (reason) out.push({ documentId: c.documentId, select: false, reason });
  }
  return out;
}

function parseReason(raw: string): string | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const r = (JSON.parse(match[0]) as { reason?: unknown }).reason;
    return typeof r === 'string' && r.trim() ? r.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Keep what is usable, drop what is not, invent nothing. An id the model made
 * up is discarded — ruling on a candidate that does not exist is not a ruling —
 * and a candidate the model skipped simply stays absent, which the assembly
 * records as `unruled`.
 */
function parseDecisions(raw: string, validIds: ReadonlySet<string>): EditorialDecision[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as { decisions?: unknown };
    if (!Array.isArray(parsed.decisions)) return [];
    const out: EditorialDecision[] = [];
    const seen = new Set<string>();
    for (const d of parsed.decisions) {
      if (typeof d !== 'object' || d === null) continue;
      const { id, select, reason, subject } = d as Record<string, unknown>;
      if (typeof id !== 'string' || !validIds.has(id) || seen.has(id)) continue;
      if (typeof select !== 'boolean') continue;
      seen.add(id);
      out.push({
        documentId: id,
        select,
        reason: typeof reason === 'string' ? reason : undefined,
        ...(typeof subject === 'string' ? { subject } : {})
      });
    }
    return out;
  } catch {
    return [];
  }
}
