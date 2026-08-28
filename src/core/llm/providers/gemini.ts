import type { LlmProvider, GenerateOptions } from '../provider';
import type { Transport } from '../../net/transport';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiConfig {
  /** How the call leaves the machine. Supplied by the host — see `Transport`. */
  transport: Transport;
  apiKey: string;
}

/**
 * Google Gemini, ported from Crabe's call shape: key in `x-goog-api-key`,
 * system prompt in `systemInstruction`, everything else in `generationConfig`.
 * Unlike Anthropic, Gemini accepts `temperature`.
 *
 * On schemas: Gemini can constrain decoding with `responseSchema`, but its
 * dialect is an OpenAPI subset that rejects some of what a plain JSON Schema
 * allows (`additionalProperties`, among others). Sending our schema through
 * unchanged would turn a scoring call into a 400 the user has to decode. So we
 * ask only for `responseMimeType: application/json` — the reply is still JSON,
 * just not schema-checked, and every caller parses defensively anyway.
 */
export function createGeminiProvider(config: GeminiConfig): LlmProvider {
  async function call(
    contents: Array<{ role: string; parts: Array<{ text: string }> }>,
    opts: GenerateOptions
  ): Promise<string> {
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: opts.maxTokens ?? 256
    };
    if (opts.temperature !== undefined) generationConfig.temperature = opts.temperature;
    if (opts.jsonSchema) generationConfig.responseMimeType = 'application/json';

    const body: Record<string, unknown> = { contents, generationConfig };
    if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

    const res = await config.transport(
      `${BASE_URL}/models/${encodeURIComponent(opts.model)}:generateContent`,
      {
        timeoutMs: 300_000, // generation is minutes, not a hung socket
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': config.apiKey },
        body: JSON.stringify(body)
      }
    );
    if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as GeminiResponse;
    const candidate = data.candidates?.[0];

    // A safety block returns 200 with no parts and a finishReason. Same logic
    // as the Anthropic refusal: name it rather than let it read as bad JSON.
    const text = candidate?.content?.parts?.map(p => p.text ?? '').join('');
    if (!text) {
      throw new Error(
        `gemini returned no text${candidate?.finishReason ? ` (${candidate.finishReason})` : ''}`
      );
    }
    return text;
  }

  return {
    id: 'gemini',
    generate: (prompt, opts) => call([{ role: 'user', parts: [{ text: prompt }] }], opts),

    chat: (messages, opts) => {
      const system = messages
        .filter(m => m.role === 'system')
        .map(m => m.content)
        .join('\n\n');
      const contents = messages
        .filter(m => m.role !== 'system')
        // Gemini names the assistant turn "model".
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));
      return call(contents, { ...opts, system: system || undefined });
    }
  };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
}
