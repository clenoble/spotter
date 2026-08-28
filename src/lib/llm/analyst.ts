import { generate, chat, type ChatMessage } from './ollama';
import type {
  PostSummary,
  PreferenceDoc,
  PrefOp,
  PrefListField
} from '$shared/types';

const ANALYST_MODEL = 'qwen2.5:7b';

const SUMMARIZE_SYSTEM = `You are a structured content analyzer. Output ONLY valid JSON matching the user's schema. No prose outside the JSON.`;

export interface SummarizablePost {
  authorName: string;
  text: string;
}

export async function summarize(post: SummarizablePost): Promise<PostSummary> {
  const prompt = `Schema: {"topics": string[], "tone": string, "lengthClass": "short"|"medium"|"long", "kind": "claim"|"opinion"|"story"|"news"|"promo"|"other", "language": string}

Post by ${post.authorName}:
${post.text.slice(0, 2000)}

JSON:`;
  const raw = await generate(prompt, {
    model: ANALYST_MODEL,
    system: SUMMARIZE_SYSTEM,
    temperature: 0.2,
    maxTokens: 256
  });
  return parseOrDefault(raw);
}

const EDIT_SYSTEM = `You are Spotter, a personal feed-ranking assistant.

The user describes what they want to see more or less of in their feed.
Interpret their intent and propose precise, minimal changes to their
preference document.

Output ONLY valid JSON matching this shape. No prose outside the JSON:
{
  "reply": "a short conversational reply, 1-2 sentences",
  "ops": [
    {"field": "<field>", "op": "add" | "remove", "value": "<short lowercase phrase>"}
  ]
}

Valid fields: topicsMore, topicsLess, tonePreferences, authorsBoost,
authorsMute, customRules.

Rules:
- If the user asks a question or is conversing without proposing a change,
  return an empty ops array and answer in reply.
- Use short, durable phrases for values ("hustle culture", not "the kind
  of posts that feel like hustle culture BS").
- One op per change. Do not touch fields the user did not mention.
- Do not propose changes the user did not clearly ask for.`;

export async function chatForPreferenceEdit(
  history: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>,
  currentPrefs: PreferenceDoc
): Promise<{ reply: string; ops: PrefOp[] }> {
  const system = `${EDIT_SYSTEM}

Current preferences:
${JSON.stringify(
  {
    topicsMore: currentPrefs.topicsMore,
    topicsLess: currentPrefs.topicsLess,
    tonePreferences: currentPrefs.tonePreferences,
    authorsBoost: currentPrefs.authorsBoost,
    authorsMute: currentPrefs.authorsMute,
    customRules: currentPrefs.customRules
  },
  null,
  2
)}`;

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...history.map(m => ({ role: m.role, content: m.content }))
  ];

  const raw = await chat(messages, {
    model: ANALYST_MODEL,
    temperature: 0.2,
    maxTokens: 600
  });
  return parseEditResponse(raw);
}

const VALID_FIELDS: PrefListField[] = [
  'topicsMore',
  'topicsLess',
  'tonePreferences',
  'authorsBoost',
  'authorsMute',
  'customRules'
];

function parseEditResponse(raw: string): { reply: string; ops: PrefOp[] } {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { reply: raw.trim(), ops: [] };
  try {
    const x = JSON.parse(match[0]) as {
      reply?: unknown;
      ops?: unknown;
    };
    const reply = String(x.reply ?? '').trim();
    const opsArr = Array.isArray(x.ops) ? x.ops : [];
    const ops: PrefOp[] = [];
    for (const raw of opsArr) {
      if (!isRecord(raw)) continue;
      const field = raw.field;
      const op = raw.op;
      const value = raw.value;
      if (
        typeof field === 'string' &&
        VALID_FIELDS.includes(field as PrefListField) &&
        (op === 'add' || op === 'remove') &&
        typeof value === 'string' &&
        value.trim().length > 0
      ) {
        ops.push({
          field: field as PrefListField,
          op,
          value: value.trim().toLowerCase()
        });
      }
    }
    return { reply, ops };
  } catch {
    return { reply: raw.trim(), ops: [] };
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function parseOrDefault(raw: string): PostSummary {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return fallback();
  try {
    const x = JSON.parse(match[0]);
    const lengthClass = ['short', 'medium', 'long'].includes(x.lengthClass)
      ? (x.lengthClass as 'short' | 'medium' | 'long')
      : 'medium';
    const kind = ['claim', 'opinion', 'story', 'news', 'promo', 'other'].includes(x.kind)
      ? (x.kind as PostSummary['kind'])
      : 'other';
    return {
      topics: Array.isArray(x.topics) ? x.topics.map(String) : [],
      tone: String(x.tone ?? 'neutral'),
      lengthClass,
      kind,
      language: String(x.language ?? 'unknown')
    };
  } catch {
    return fallback();
  }
}

function fallback(): PostSummary {
  return { topics: [], tone: 'neutral', lengthClass: 'medium', kind: 'other', language: 'unknown' };
}
