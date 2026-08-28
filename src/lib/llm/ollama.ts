// Compatibility shim. The Ollama client now lives in the host-agnostic core
// (`$core/llm/providers/ollama`). `analyst.ts` still imports `generate`/`chat`
// as free functions; this re-exports them bound to a default local provider.
// Migrating the analyst path to an injected provider is the next step.
import { createOllamaProvider } from '$core/llm/providers/ollama';
import type { GenerateOptions, ChatMessage } from '$core/llm/provider';
import { browserTransport } from '$lib/transport';

export type { ChatMessage };

const provider = createOllamaProvider({ transport: browserTransport });

export function generate(prompt: string, opts: GenerateOptions): Promise<string> {
  return provider.generate(prompt, opts);
}

export function chat(
  messages: readonly ChatMessage[],
  opts: Omit<GenerateOptions, 'system'>
): Promise<string> {
  return provider.chat(messages, opts);
}
