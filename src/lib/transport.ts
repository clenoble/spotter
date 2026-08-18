import type { Transport, TransportInit } from '$core/net/transport';
import type { TransportDeclaration } from '$core/capabilities';

/**
 * The browser host's transport (§6.3).
 *
 * This is the file the core is *not* allowed to be: it reaches for `fetch`
 * deliberately, because that is what a host does. The rule is that the core
 * takes a capability and never takes one for itself — the host is where the
 * taking happens, once, visibly.
 *
 * ## `cache: 'no-store'`, and exactly what it buys
 *
 * A transport leaves traces where it runs. Under a webview with no partition —
 * measured in Sovereign's embedded browser, but true of any ordinary browser
 * profile — a fetched page has a durable copy in the HTTP cache, unencrypted
 * and not separated by persona. `no-store` tells the browser neither to read
 * from that cache nor to write to it.
 *
 * ⚠️ **Bounded claim, stated narrowly on purpose: it closes the on-disk copy of
 * the response body, and nothing else.** Not the DNS cache, not TLS session
 * state, not whatever the platform logs beneath us. A mitigation announced
 * wider than it reaches is worse than none, because it stops anyone looking
 * further.
 *
 * ## What this host cannot declare
 *
 * SSRF protection is **partial** here and complete under Sovereign, and the
 * difference is structural rather than unfinished work. `classifyAddress`
 * rejects literal private, loopback and link-local addresses; a *hostname that
 * resolves* to one is invisible, because an extension has no pre-request
 * resolution and no way to pin a connection to the address it classified. So a
 * name checked now can resolve elsewhere a moment later.
 */
export const browserTransport: Transport = (url: string, init?: TransportInit) =>
  fetch(url, {
    method: init?.method,
    headers: init?.headers,
    body: init?.body,
    cache: 'no-store',
    // Nothing this project sends needs ambient credentials, and omitting them
    // keeps a cookie jar from being consulted for a request the user did not
    // make as themselves.
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    // ⚠️ Always a timeout — the caller's when it gave one, 30s otherwise. The
    // first full validation run hung for half an hour on one socket with
    // Ollama idle: `createFetcher` had declared the timeout "honoured by the
    // host's transport", and no transport honoured it — a guarantee declared
    // on one side and absent on the other, the recurring defect this project
    // keeps finding in itself. One hanging server costs one candidate, never
    // the night.
    signal: AbortSignal.timeout(init?.timeoutMs ?? 30_000)
  });

/**
 * What this transport guarantees, carried **with** it rather than written in a
 * document beside it (§6.3).
 *
 * A separate manifest would say "guarded" while the wiring passed a bare
 * `fetch`, and nothing would catch it — the promise this project refuses, in
 * the object built to state the truth about guarantees. Declaring and wiring
 * have to be one act.
 *
 * This is not a proof and is not sold as one: any object literal can carry
 * these fields. It moves the fault from *someone forgot to update the manifest*
 * — silent, late, the normal failure — to *someone knowingly wrote something
 * false*, which is visible in review.
 */
export const browserTransportDeclaration: TransportDeclaration = {
  capability: 'transport',
  /** How to read the lines below: declared by the host, checkable in review. */
  backing: 'declared',
  /** No on-disk copy of response bodies. DNS and TLS state are untouched. */
  responseCacheOnDisk: false,
  /** Literal addresses only — a resolving hostname is not visible from here. */
  ssrfProtection: 'partial'
};
