import type { LlmProvider, GenerateOptions } from '../provider';
import type { Transport } from '../../net/transport';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

export interface AnthropicConfig {
  /** How the call leaves the machine. Supplied by the host — see `Transport`. */
  transport: Transport;
  apiKey: string;
}

/**
 * Anthropic Messages API, called straight from the extension service worker —
 * the same shape Crabe uses, with three corrections the current models require.
 *
 * 1. **No `temperature`.** Current Anthropic models reject the sampling
 *    parameters with a 400. Crabe still sends one because it pins an older
 *    model; ported verbatim onto a current model id it would fail on every
 *    request. Steering happens through the prompt instead.
 * 2. **Thinking off.** Thinking is on by default on the current models, and
 *    `max_tokens` caps thinking *plus* reply. An axis asking for ~120 tokens
 *    would spend them all thinking and truncate before writing its verdict.
 * 3. **Structured output** when the caller supplies a schema — the decoder is
 *    constrained, so unparseable JSON stops being a failure mode. That matters
 *    here: the eval harness counts an unparseable reply as an absent verdict.
 *
 * The `anthropic-dangerous-direct-browser-access` header is what makes a
 * browser-origin call legal. Note what it implies: the user's key lives in the
 * extension and is sent from their machine. That is the point — it is *their*
 * key, spent on their behalf, never proxied through anyone else — but it is
 * also why cloud mode is opt-in and per-axis (spec §6.1).
 */
export function createAnthropicProvider(config: AnthropicConfig): LlmProvider {
  const headers = {
    'content-type': 'application/json',
    'x-api-key': config.apiKey,
    'anthropic-version': API_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true'
  };

  async function call(
    messages: ReadonlyArray<{ role: string; content: string }>,
    opts: GenerateOptions
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model: opts.model,
      max_tokens: opts.maxTokens ?? 256,
      messages,
      thinking: { type: 'disabled' }
    };
    if (opts.system) body.system = opts.system;
    if (opts.jsonSchema) {
      body.output_config = {
        format: { type: 'json_schema', schema: narrowSchema(opts.jsonSchema) }
      };
    }

    const res = await config.transport(ENDPOINT, {
        timeoutMs: 300_000, // generation is minutes, not a hung socket
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as AnthropicResponse;

    // A refusal is a successful HTTP 200 with an empty or partial `content`.
    // Reading content[0] blindly would surface it as a parse error and blame
    // the wrong thing; name it instead.
    if (data.stop_reason === 'refusal') {
      throw new Error(
        `anthropic declined this request${
          data.stop_details?.category ? ` (${data.stop_details.category})` : ''
        }`
      );
    }

    const text = data.content?.find(b => b.type === 'text')?.text;
    if (text === undefined) throw new Error('anthropic returned no text block');
    return text;
  }

  return {
    id: 'anthropic',
    generate: (prompt, opts) => call([{ role: 'user', content: prompt }], opts),

    // `messages` here may carry system-role entries (the shared `ChatMessage`
    // shape allows them, and Ollama takes them inline). Anthropic wants the
    // system prompt as a top-level field, so lift them out rather than send a
    // role the API will reject.
    chat: (messages, opts) => {
      const system = messages
        .filter(m => m.role === 'system')
        .map(m => m.content)
        .join('\n\n');
      const turns = messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: m.content }));
      return call(turns, { ...opts, system: system || undefined });
    }
  };
}

/**
 * Anthropic's structured-output dialect rejects the numeric and length
 * constraints plain JSON Schema allows — `{"type":"integer","minimum":0}` is a
 * 400, not an ignored hint. Ollama accepts them, so the axis keeps writing the
 * honest schema and each provider narrows it to what its own decoder takes.
 * The bounds were never load-bearing anyway: every caller clamps what it parses.
 */
const UNSUPPORTED = new Set([
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'pattern'
]);

function narrowSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(narrowSchema);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (UNSUPPORTED.has(k)) continue;
    out[k] = narrowSchema(v);
  }
  return out;
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  stop_details?: { category?: string } | null;
}
