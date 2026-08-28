import type { PreferenceDoc } from '$core/index';
import type { DigestView } from '$shared/messages';
import type { BackendSettings } from '$lib/settings';

/**
 * The extension's client for the companion (host #3).
 *
 * When a companion is reachable, the extension stands down as producer and
 * becomes a reader — same endpoints the phone reads, same `DigestView` shapes.
 * When it is not, the extension produces locally, unchanged: §6's hard
 * requirement (*standalone first*) is not negotiable and this file is written
 * to disappear gracefully.
 *
 * Flow doctrine (Céline, 2026-08-19): content is **pulled** from the
 * companion; the only **push** is the user's own declarations — topics, feeds,
 * examples, backend settings — from her dashboard to her own machine. That
 * includes API keys when a cloud provider is chosen: they land in the
 * companion's `declarations.json` on the same machine, which is the same
 * trust boundary as the browser profile they came from — stated, not slid.
 *
 * v0.1 limit, stated: histories do not merge yet. Companion present → its
 * view serves whole (its history included); absent → the local one. The
 * additive per-surface merge (§6.4) is designed and deferred.
 */
export interface CompanionClient {
  getDigest(day?: string): Promise<DigestView>;
  getDays(): Promise<string[]>;
  postRun(): Promise<void>;
  postCancel(): Promise<boolean>;
  postGesture(documentId: string, kind: 'open' | 'read'): Promise<void>;
  pushDeclarations(prefs: PreferenceDoc, settings: BackendSettings): Promise<void>;
}

const PROBE_TIMEOUT_MS = 1500;

/** Is a companion serving there? Tokenless `/health`, fast, never throws. */
export async function probeCompanion(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${base(url)}/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!res.ok) return false;
    const body = (await res.json()) as { app?: unknown };
    return body.app === 'spotter-companion';
  } catch {
    return false;
  }
}

export function createCompanionClient(url: string, token: string): CompanionClient {
  const call = async (path: string, init?: RequestInit): Promise<Response> => {
    const res = await fetch(`${base(url)}${path}`, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000)
    });
    if (!res.ok) throw new Error(`companion ${res.status} on ${path}: ${await res.text()}`);
    return res;
  };

  return {
    async getDigest(day) {
      const res = await call(`/digest${day ? `?day=${day}` : ''}`);
      return (await res.json()) as DigestView;
    },
    async getDays() {
      const res = await call('/days');
      return ((await res.json()) as { days: string[] }).days;
    },
    async postRun() {
      await call('/run', { method: 'POST' });
    },
    async postCancel() {
      const res = await call('/run/cancel', { method: 'POST' });
      return ((await res.json()) as { cancelling: boolean }).cancelling;
    },
    async postGesture(documentId, kind) {
      await call('/gesture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, kind })
      });
    },
    async pushDeclarations(prefs, settings) {
      await call('/declarations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefs,
          backend: {
            provider: settings.provider,
            model: settings.model,
            apiKeys: settings.apiKeys,
            ollamaHost: settings.ollamaHost,
            searxngUrl: settings.searxngUrl ?? 'http://localhost:8888',
            fetchBudget: settings.fetchBudget
          }
        })
      });
    }
  };
}

function base(url: string): string {
  return url.replace(/\/+$/, '');
}
