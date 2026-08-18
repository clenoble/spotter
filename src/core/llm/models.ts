import type { ProviderId } from './registry';

/**
 * What the user can pick, per provider. A short curated list rather than a live
 * catalogue: the settings surface has to be readable, and an unrecognised model
 * id fails at the first scored post rather than at save time.
 *
 * The user may still type any id — this list seeds the choice, it does not
 * fence it. `local` is deliberately first: it is the protective default (spec
 * §6.1), and the path of least resistance should point the safe way.
 */
export interface ModelOption {
  id: string;
  label: string;
  note?: string;
}

export const MODELS: Record<ProviderId, ModelOption[]> = {
  ollama: [
    { id: 'mistral', label: 'Mistral 7B', note: 'default — Crabe uses the same' },
    { id: 'qwen2.5:3b', label: 'Qwen 2.5 3B', note: 'fastest; weakest judgment' },
    { id: 'qwen2.5:7b', label: 'Qwen 2.5 7B', note: 'slower; clearly better on Pollution' }
  ],
  anthropic: [
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', note: 'cheapest, fast enough to scroll' },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
    { id: 'claude-opus-5', label: 'Claude Opus 5', note: 'most capable, most expensive' }
  ],
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'cheapest' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }
  ]
};

/** Per-provider default, used until the user chooses otherwise. */
export const DEFAULT_MODEL: Record<ProviderId, string> = {
  ollama: 'mistral',
  anthropic: 'claude-haiku-4-5',
  gemini: 'gemini-2.5-flash'
};

/** Cloud providers need a key; the local one does not. */
export const NEEDS_API_KEY: Record<ProviderId, boolean> = {
  ollama: false,
  anthropic: true,
  gemini: true
};
