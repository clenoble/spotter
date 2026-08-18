import type { ProviderConfig, ProviderId } from '$core/index';
import { DEFAULT_MODEL, NEEDS_API_KEY } from '$core/index';
import { browserTransport } from '$lib/transport';

/**
 * Backend settings — which provider runs the axes, and the key it needs.
 *
 * Kept in `chrome.storage.local` rather than IndexedDB: the service worker
 * needs it on every scored post and gets change notifications for free, so a
 * new key takes effect without a reload.
 *
 * The key never leaves the device except to the provider the user chose. There
 * is no sync storage here on purpose — `chrome.storage.sync` would push the
 * key through the browser vendor's account, which is exactly the kind of quiet
 * egress this project refuses.
 */
export interface BackendSettings {
  provider: ProviderId;
  model: string;
  /** Per provider, so switching back and forth doesn't discard a key. */
  apiKeys: Partial<Record<ProviderId, string>>;
  ollamaHost: string;
  /** The self-hosted search substrate (§5.1). Backend config, not preference. */
  searxngUrl?: string;
}

const KEY = 'backend';

export const DEFAULT_SETTINGS: BackendSettings = {
  provider: 'ollama',
  model: DEFAULT_MODEL.ollama,
  apiKeys: {},
  ollamaHost: 'http://localhost:11434',
  searxngUrl: 'http://localhost:8888'
};

export async function getSettings(): Promise<BackendSettings> {
  const stored = await chrome.storage.local.get(KEY);
  const saved = stored[KEY] as Partial<BackendSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
}

export async function putSettings(settings: BackendSettings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: settings });
}

/** Fires whenever the settings change, in any surface. */
export function onSettingsChanged(fn: (settings: BackendSettings) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string
  ): void => {
    if (area !== 'local' || !(KEY in changes)) return;
    fn({ ...DEFAULT_SETTINGS, ...((changes[KEY].newValue as BackendSettings) ?? {}) });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export function toProviderConfig(settings: BackendSettings): ProviderConfig {
  return {
    id: settings.provider,
    host: settings.ollamaHost,
    apiKey: settings.apiKeys[settings.provider],
    // The host supplies the transport; the core never takes one (§6.3).
    transport: browserTransport
  };
}

/** Why the current settings can't build a provider, or null if they can. */
export function settingsProblem(settings: BackendSettings): string | null {
  if (NEEDS_API_KEY[settings.provider] && !settings.apiKeys[settings.provider]) {
    return `${settings.provider} needs an API key before it can score anything.`;
  }
  if (!settings.model.trim()) return 'No model chosen.';
  return null;
}
