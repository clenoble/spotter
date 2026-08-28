/**
 * The LLM backend, abstracted away from the engine. A provider is a configured
 * endpoint (local Ollama, or — once implemented — a BYO-key cloud model). The
 * engine never imports a concrete backend; it is handed a provider.
 *
 * Model selection is per-call (`opts.model`) rather than per-provider, because
 * the per-axis backend choice (spec §6.1, F6) will pick model + provider per
 * axis once a settings surface exists.
 */
export interface GenerateOptions {
  model: string;
  system?: string;
  /**
   * Advisory. Current Anthropic models **reject** `temperature` with a 400, so
   * that provider drops it; Ollama and Gemini honour it.
   */
  temperature?: number;
  maxTokens?: number;
  /**
   * JSON Schema the reply must satisfy. Providers that can constrain decoding
   * do so (Anthropic structured outputs, Ollama `format`), which turns "the
   * model returned unparseable text" from a runtime failure into an
   * impossibility. Providers that can't simply ignore it — every caller still
   * parses defensively, so the schema is an optimisation, never a guarantee
   * the caller may rely on.
   */
  jsonSchema?: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmProvider {
  readonly id: string;
  generate(prompt: string, opts: GenerateOptions): Promise<string>;
  chat(messages: readonly ChatMessage[], opts: Omit<GenerateOptions, 'system'>): Promise<string>;
}
