/**
 * How anything leaves the machine — **a host capability, never the core's**
 * (§6, and §6.3's per-class manifest).
 *
 * *Added 2026-08-04 for the search adapters, moved here the same evening when
 * the capability guard found the LLM providers doing the same thing.* It lived
 * in `search/adapter.ts` while search was its only consumer; it has two
 * families now, and a shared capability parked inside one of its consumers is
 * the sort of thing nobody moves until it has already misled someone.
 *
 * ## Why the core must not reach for this
 *
 * A transport does not only carry a request, it **leaves traces where it
 * runs** — an HTTP cache entry, a DNS record, a cookie jar, a session ticket.
 * Under a host whose transport is a webview with no partition, those traces sit
 * unencrypted and unseparated by persona, out of reach of anything the core
 * does in memory.
 *
 * And the payloads differ in weight, which is why this is not a tidiness rule:
 *
 * - **Search queries** are, by §5.1, a portrait of what the user wants to know
 *   — heavier disclosure than the pages they retrieve.
 * - **LLM calls** carry the document *and* the user model. For the intimate
 *   axes (§6.1) that is the heaviest payload in the system.
 *
 * ⚠️ **The core cannot check what a transport persists, and must not pretend
 * to.** That is host-specific and unenumerable from here. So *trace-free for
 * this class* is a property the **host declares** about the transport it
 * supplies — never a test this module performs. Relying on a provider's cache
 * headers would be worse than nothing: a container deciding a property of its
 * contents.
 *
 * Structurally satisfied by the global `fetch`, so a host may pass it — but it
 * must *choose* to, which is the whole point. There is deliberately **no
 * default**: a default would be the core reaching for a capability every time
 * someone forgot, which is the failure this exists to remove. That failure is
 * not hypothetical — it is what `test/capabilities.ts` found in seven places,
 * three of them after the rule had been written down.
 */
export type Transport = (url: string, init?: TransportInit) => Promise<TransportResponse>;

export interface TransportInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /**
   * How long this call may take before the host cuts the socket. **The caller
   * sets it, because the caller knows the operation class**: a page fetch that
   * takes 20s is a hung server, an LLM judging a fifteen-item slate at 20s is
   * working. A host applies its own default when unset — and must apply
   * *something*: the first full validation run hung half an hour on one
   * socket, with the timeout declared "the transport's job" and no transport
   * doing it. One hanging server costs one candidate, never the night.
   */
  timeoutMs?: number;
}

/** The subset of `Response` the core uses. The global `Response` satisfies it. */
export interface TransportResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}
