import type { LlmProvider } from './provider';
import type { Transport } from '../net/transport';
import { createOllamaProvider } from './providers/ollama';
import { createAnthropicProvider } from './providers/anthropic';
import { createGeminiProvider } from './providers/gemini';

export type ProviderId = 'ollama' | 'anthropic' | 'gemini';

export interface ProviderConfig {
  id: ProviderId;
  host?: string; // ollama endpoint
  apiKey?: string; // BYO-key for cloud providers (spec §6.1)
  /**
   * How the call leaves the machine (§6.3). Required, and required *here* as
   * well as on each provider: a registry that supplied its own would be the
   * core reaching for a capability on the callers' behalf, which is the same
   * defect one level up.
   */
  transport: Transport;
}

/**
 * Construct a provider from user config. One provider serves every axis today;
 * the per-axis, per-provider split (spec §6.1, F6) layers on top of this — the
 * caller decides which provider to hand each scorer, so the engine needs no
 * change when that arrives.
 */
export function createProvider(config: ProviderConfig): LlmProvider {
  switch (config.id) {
    case 'ollama':
      return createOllamaProvider({ host: config.host, transport: config.transport });
    case 'anthropic':
      if (!config.apiKey) throw new Error('Anthropic needs an API key');
      return createAnthropicProvider({ apiKey: config.apiKey, transport: config.transport });
    case 'gemini':
      if (!config.apiKey) throw new Error('Gemini needs an API key');
      return createGeminiProvider({ apiKey: config.apiKey, transport: config.transport });
  }
}
