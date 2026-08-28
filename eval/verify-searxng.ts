import { createSearxngAdapter, keepResolvable } from '../src/core/index';

/**
 * Confronts the SearXNG adapter with a real instance — the step the fixture
 * tests explicitly cannot do. Run against the user's own instance:
 *
 *   npx tsx eval/verify-searxng.ts [baseUrl]
 */
const baseUrl = process.argv[2] ?? 'http://localhost:8888';

async function main(): Promise<void> {
  // The transport is supplied here rather than reached for inside the core
  // (§6.3). This harness runs under Node, where the global `fetch` leaves no
  // browser cache behind — a host with different traces supplies a different
  // one, which is the whole point of the capability being injected.
  const adapter = createSearxngAdapter({ baseUrl, transport: (url, init) => fetch(url, init) });
  const results = await adapter.search({ q: 'attention economy critique', count: 10 });
  const { kept, dropped } = keepResolvable(results);

  console.log(`\ninstance : ${baseUrl}`);
  console.log(`résultats: ${results.length}   retenus: ${kept.length}   écartés: ${dropped.length}\n`);

  for (const r of kept.slice(0, 5)) {
    console.log(`  ${r.title.slice(0, 62)}`);
    console.log(`    ${r.url.slice(0, 78)}`);
    console.log(`    moteur=${r.engine}  date=${r.publishedAt ?? '—'}  extrait=${r.snippet ? r.snippet.length + ' car.' : 'aucun'}`);
  }
  for (const d of dropped) console.log(`  écarté (non résolvable): ${d.url.slice(0, 70)}`);

  const engines = [...new Set(results.map(r => r.engine))];
  console.log(`\nmoteurs ayant répondu : ${engines.join(', ')}`);
  const leaks = engines.filter(e => /google|startpage/i.test(e));
  console.log(leaks.length ? `!! moteur personnalisant actif : ${leaks.join(', ')}` : 'aucun moteur personnalisant ✓');
}

main().catch(err => {
  console.error('\n✗', err instanceof Error ? err.message : String(err), '\n');
  process.exit(1);
});
