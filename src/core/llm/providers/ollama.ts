import type { LlmProvider } from '../provider';
import type { Transport } from '../../net/transport';

const DEFAULT_HOST = 'http://localhost:11434';

export interface OllamaConfig {
  /** How the call leaves the machine. Supplied by the host — see `Transport`. */
  transport: Transport;
  host?: string;
}

/**
 * Local Ollama backend. `fetch` is available both in the extension and in
 * Node 18+ (the eval harness), so this provider is host-agnostic.
 */
export function createOllamaProvider(config: OllamaConfig): LlmProvider {
  const host = config.host ?? DEFAULT_HOST;
  return {
    id: 'ollama',

    async generate(prompt, opts) {
      const res = await config.transport(`${host}/api/generate`, {
        timeoutMs: 300_000, // generation is minutes, not a hung socket
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: opts.model,
          prompt,
          system: opts.system,
          stream: false,
          // Ollama constrains decoding to a JSON Schema passed as `format`.
          ...(opts.jsonSchema ? { format: opts.jsonSchema } : {}),
          options: {
            temperature: opts.temperature ?? 0.2,
            num_predict: opts.maxTokens ?? 256
          }
        })
      });
      if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { response: string };
      return data.response;
    },

    async chat(messages, opts) {
      const res = await config.transport(`${host}/api/chat`, {
        timeoutMs: 300_000, // generation is minutes, not a hung socket
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: opts.model,
          messages,
          stream: false,
          ...(opts.jsonSchema ? { format: opts.jsonSchema } : {}),
          options: {
            temperature: opts.temperature ?? 0.4,
            num_predict: opts.maxTokens ?? 512
          }
        })
      });
      if (!res.ok) throw new Error(`ollama chat ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { message: { content: string } };
      return data.message.content;
    }
  };
}
