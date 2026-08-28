/**
 * Is this URL safe to *fetch*? — distinct from whether it is honest to *show*.
 *
 * `looksResolvable` (search/adapter) asks whether a link can be handed to the
 * reader: scheme, opaque redirectors. This asks something else entirely —
 * whether making the request reaches somewhere it should not. Two questions,
 * two answers, two rejection reasons, because collapsing them would lose one:
 * the same defect as counting a deduplication as a rejection (§5.2).
 *
 * ## Why the funnel needs this at all
 *
 * **A result URL is untrusted input.** Anyone who can get a page indexed
 * influences what comes back from a search, and the funnel fetches what comes
 * back. Until 2026-08-04 that was treated as provider data — the Sovereign
 * instance's question about their SSRF guard is what surfaced it. Their guard
 * sits on their side of a boundary Spotter does not have under the browser
 * host, so the classification has to exist here too.
 *
 * ⚠️ **Note where it does *not* belong: the configured `baseUrl` of a
 * self-hosted engine.** There, loopback is the *expected* value — SearXNG runs
 * on the user's own machine. A guard applied to configuration would not merely
 * fail to protect, it would break the self-hosted path, which is the protective
 * default. Guarding the wrong surface is worse than not guarding.
 *
 * ## What this can and cannot see
 *
 * It classifies **literal addresses**. A hostname that *resolves* to a private
 * address is undetectable from here: a browser extension has no DNS resolution
 * before the request and no way to pin the connection to the address it
 * classified, so a name checked now can resolve elsewhere a moment later
 * (DNS rebinding). Under Sovereign the host's transport does the full job —
 * validate, pin, re-check per hop. **The browser host therefore declares
 * partial protection and Sovereign complete**, and the manifest says which
 * (§6.3): "guarded retrieval" without its degree would read as equivalent.
 *
 * ## Two measurements that shaped this, rather than assumptions
 *
 * **The URL parser normalises encoded IPv4 for us.** `2130706433`,
 * `0x7f.0.0.1`, `017700000001` and even `①②⑦.0.0.1` all arrive as
 * `127.0.0.1`. The defensive decoding this file would otherwise need does not
 * need writing — measured, not trusted to documentation.
 *
 * ⚠️ **But normalisation cuts the other way for IPv4-mapped IPv6.**
 * `::ffff:127.0.0.1` is stored as `::ffff:7f00:1` — the same address with the
 * loopback no longer legible. A check looking for a dotted quad after `::ffff:`
 * would miss every mapped address the parser has touched, which is all of them.
 * So the mapped form is unwrapped from its hex pairs.
 */

export type AddressVerdict = { safe: true } | { safe: false; reason: string };

const SAFE: AddressVerdict = { safe: true };
const unsafe = (reason: string): AddressVerdict => ({ safe: false, reason });

/**
 * Hostnames that name the local machine or a local network without ever
 * reaching a resolver we could inspect.
 */
function classifyHostname(host: string): AddressVerdict | null {
  if (host === 'localhost' || host.endsWith('.localhost')) return unsafe('localhost');
  // mDNS: resolved on the local link, so it names a neighbour by construction.
  if (host.endsWith('.local')) return unsafe('mDNS local name');
  return null;
}

function classifyIpv4(octets: readonly number[]): AddressVerdict {
  const [a, b] = octets;
  if (a === 0) return unsafe('"this network" 0.0.0.0/8');
  if (a === 10) return unsafe('private 10.0.0.0/8');
  if (a === 127) return unsafe('loopback 127.0.0.0/8');
  if (a === 100 && b >= 64 && b <= 127) return unsafe('carrier-grade NAT 100.64.0.0/10');
  // 169.254.169.254 is the cloud metadata endpoint on every major provider —
  // the single most valuable target an SSRF can reach, and it is link-local.
  if (a === 169 && b === 254) return unsafe('link-local 169.254.0.0/16 (cloud metadata)');
  if (a === 172 && b >= 16 && b <= 31) return unsafe('private 172.16.0.0/12');
  if (a === 192 && b === 0) return unsafe('IETF protocol assignments 192.0.0.0/24');
  if (a === 192 && b === 168) return unsafe('private 192.168.0.0/16');
  if (a === 198 && (b === 18 || b === 19)) return unsafe('benchmarking 198.18.0.0/15');
  if (a >= 224 && a <= 239) return unsafe('multicast 224.0.0.0/4');
  if (a >= 240) return unsafe('reserved 240.0.0.0/4');
  return SAFE;
}

function parseIpv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

function classifyIpv6(host: string): AddressVerdict {
  const h = host.toLowerCase();
  if (h === '::1') return unsafe('IPv6 loopback ::1');
  if (h === '::') return unsafe('IPv6 unspecified ::');

  // IPv4-mapped, in the form the parser actually stores (hex pairs, not dotted).
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (mapped) {
    const hi = parseInt(mapped[1], 16);
    const lo = parseInt(mapped[2], 16);
    return classifyIpv4([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]);
  }
  // The dotted spelling too, in case a caller hands us an un-normalised string.
  const mappedDotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(h);
  if (mappedDotted) {
    const octets = parseIpv4(mappedDotted[1]);
    return octets ? classifyIpv4(octets) : SAFE;
  }

  const head = h.split(':')[0];
  if (/^f[cd][0-9a-f]{2}$/.test(head)) return unsafe('IPv6 unique local fc00::/7');
  if (/^fe[89ab][0-9a-f]$/.test(head)) return unsafe('IPv6 link-local fe80::/10');
  if (/^ff[0-9a-f]{2}$/.test(head)) return unsafe('IPv6 multicast ff00::/8');
  return SAFE;
}

/**
 * Classify a URL's destination.
 *
 * A URL we cannot parse is refused rather than passed: an address we could not
 * read is not an address we may declare safe. That is `not_run ≠ zero` on a
 * safety check — unmeasured must not read as clear.
 */
export function classifyAddress(url: string): AddressVerdict {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return unsafe('unparseable URL');
  }

  const raw = parsed.hostname;
  if (raw === '') return unsafe('no host');

  // IPv6 arrives bracketed in `hostname`; everything else does not.
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return classifyIpv6(raw.slice(1, -1));
  }

  const byName = classifyHostname(raw.toLowerCase());
  if (byName) return byName;

  const octets = parseIpv4(raw);
  if (octets) return classifyIpv4(octets);

  // A registrable name. Whether it resolves somewhere private is exactly what
  // this host cannot see — stated in the manifest rather than assumed away.
  return SAFE;
}
