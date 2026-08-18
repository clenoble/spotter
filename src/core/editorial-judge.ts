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

Output ONLY valid JSON: {"decisions": [{"id": "...", "select": true/false, "reason": "one sentence"}]}.`;

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
          reason: { type: 'string' }
        },
        required: ['id', 'select', 'reason'],
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
      const { id, select, reason } = d as Record<string, unknown>;
      if (typeof id !== 'string' || !validIds.has(id) || seen.has(id)) continue;
      if (typeof select !== 'boolean') continue;
      seen.add(id);
      out.push({ documentId: id, select, reason: typeof reason === 'string' ? reason : undefined });
    }
    return out;
  } catch {
    return [];
  }
}
