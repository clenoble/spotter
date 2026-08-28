import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAddress } from '../src/core/index';

/**
 * Correctness invariants for the address guard.
 *
 * These assert what must hold for the funnel to be faithful to §5.2 — a result
 * URL is untrusted input, and the funnel fetches it. They do **not** assert
 * that the guard is sufficient: the whole class of hostnames resolving to
 * private space is invisible from here, and that limit is a manifest entry
 * (§6.3), not something a test can close.
 */

const rejected = (url: string, expect?: RegExp) => {
  const v = classifyAddress(url);
  assert.equal(v.safe, false, `${url} must not be fetched`);
  if (!v.safe && expect) assert.match(v.reason, expect, `${url}: reason should say which range`);
};

const allowed = (url: string) => {
  assert.equal(classifyAddress(url).safe, true, `${url} should pass`);
};

test('ordinary public addresses pass', () => {
  allowed('https://www.theguardian.com/world/2026/jul/23/x');
  allowed('https://legrandcontinent.eu/fr/dimanches/');
  allowed('http://93.184.216.34/');
  allowed('https://[2606:2800:220:1:248:1893:25c8:1946]/');
});

test('loopback is refused in every spelling the parser produces', () => {
  rejected('http://127.0.0.1/', /loopback/);
  rejected('http://127.1.2.3/', /loopback/);
  rejected('http://localhost/', /localhost/);
  rejected('http://LOCALHOST/admin', /localhost/);
  rejected('http://foo.localhost/', /localhost/);
  rejected('http://[::1]/', /loopback/);
});

test('cloud metadata is refused — the address an SSRF is actually after', () => {
  rejected('http://169.254.169.254/latest/meta-data/', /link-local|metadata/);
  rejected('http://169.254.170.2/v2/credentials', /link-local|metadata/);
});

test('private and reserved ranges are refused', () => {
  rejected('http://10.0.0.1/', /10\.0\.0\.0\/8/);
  rejected('http://172.16.5.4/', /172\.16\.0\.0\/12/);
  rejected('http://172.31.255.255/', /172\.16\.0\.0\/12/);
  rejected('http://192.168.1.1/', /192\.168\.0\.0\/16/);
  rejected('http://100.64.0.1/', /carrier-grade NAT/);
  rejected('http://0.0.0.0/', /this network/);
  rejected('http://224.0.0.1/', /multicast/);
  rejected('http://255.255.255.255/', /reserved/);
});

test('addresses just outside a private range still pass', () => {
  // The boundaries are where an off-by-one hides, and both directions matter:
  // too wide breaks legitimate fetching, too narrow leaves the hole open.
  allowed('http://172.15.0.1/');
  allowed('http://172.32.0.1/');
  allowed('http://100.63.255.255/');
  allowed('http://100.128.0.1/');
  allowed('http://11.0.0.1/');
  allowed('http://192.167.0.1/');
});

test('encoded IPv4 is caught — because the parser normalises it, not because we decode it', () => {
  // Measured: the WHATWG parser turns all of these into 127.0.0.1 before we see
  // them. The defensive decoding this guard would otherwise need does not need
  // writing — but it is asserted here so that a future parser change, or a
  // hand-rolled parse, fails loudly instead of quietly reopening the hole.
  rejected('http://2130706433/', /loopback/);
  rejected('http://0x7f.0.0.1/', /loopback/);
  rejected('http://017700000001/', /loopback/);
  rejected('http://①②⑦.0.0.1/', /loopback/);
});

test('IPv4-mapped IPv6 is caught in the form the parser stores, not the readable one', () => {
  // ⚠️ The trap: `::ffff:127.0.0.1` is stored as `::ffff:7f00:1`, where the
  // loopback is no longer legible. A check looking for a dotted quad after
  // `::ffff:` would miss every mapped address the parser has touched — which is
  // all of them. Normalisation helped on the line above and hurts here.
  rejected('http://[::ffff:127.0.0.1]/', /loopback/);
  rejected('http://[::ffff:7f00:1]/', /loopback/);
  rejected('http://[::ffff:a9fe:a9fe]/', /link-local|metadata/);
  rejected('http://[::ffff:c0a8:1]/', /192\.168\.0\.0\/16/);
});

test('IPv6 private and link-local ranges are refused', () => {
  rejected('http://[fc00::1]/', /unique local/);
  rejected('http://[fd12:3456::1]/', /unique local/);
  rejected('http://[fe80::1]/', /link-local/);
  rejected('http://[ff02::1]/', /multicast/);
  rejected('http://[::]/', /unspecified/);
});

test('mDNS names are refused — they name a neighbour by construction', () => {
  rejected('http://printer.local/', /mDNS/);
});

test('what cannot be read is refused, never assumed clear', () => {
  // `not_run ≠ zero` applied to a safety check: an address we could not parse
  // is not an address we may declare safe.
  rejected('not a url', /unparseable/);
  rejected('file:///etc/passwd', /no host/);
});

test('userinfo does not disguise the host', () => {
  // The classic bypass: `example.com@` reads as the host to a person, and the
  // real destination is what follows the `@`. The parser resolves it correctly
  // — which is precisely the case a textual check would get wrong, so it is
  // asserted rather than assumed.
  rejected('http://example.com@127.0.0.1/', /loopback/);
  rejected('http://user:pw@169.254.169.254/', /link-local|metadata/);
  rejected('http://127.0.0.1:8080/admin', /loopback/);
});

test('an empty authority is not malformed — it becomes a hostname', () => {
  // Measured, and contrary to what I assumed when writing this file:
  // `http:///path` is not rejected by the parser, it becomes `http://path/`,
  // where `path` is a registrable name. So it passes, correctly. Written down
  // because the natural assumption is the opposite, and a guard built on that
  // assumption would think it had covered a case it never sees.
  allowed('http:///path');
});

test('a hostname resolving to private space is NOT caught, and that is declared', () => {
  // This is the limit, asserted so it stays visible rather than being
  // discovered. A browser extension has no pre-request resolution and no
  // connection pinning, so a name checked now can resolve elsewhere a moment
  // later. Under Sovereign the host's transport validates, pins and re-checks
  // per hop; the manifest declares partial protection here and complete there
  // (§6.3), because "guarded retrieval" without its degree reads as equivalent.
  allowed('http://localtest.me/');
});
