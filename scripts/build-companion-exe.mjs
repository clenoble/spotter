import { execSync } from 'node:child_process';
import { writeFileSync, copyFileSync, mkdirSync, statSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/**
 * Build the companion as a single executable — esbuild + Node SEA (approved
 * 2026-08-19: "ok, esbuild SEA works for me").
 *
 *   node scripts/build-companion-exe.mjs
 *
 * Three stages, each a real artifact:
 *   1. esbuild bundles companion/index.ts (core included, reader embedded)
 *      into one CommonJS file — `dist-companion/companion.cjs` is already a
 *      distribution: `node companion.cjs` runs it anywhere Node 20+ exists.
 *   2. Node's SEA tooling turns the bundle into an injectable blob.
 *   3. postject injects the blob into a copy of node.exe →
 *      `dist-companion/spotter-companion.exe` — no Node install needed.
 *
 * The exe is unsigned: Windows SmartScreen will warn on first run ("More info
 * → Run anyway"). Signing needs a certificate — a real cost, deferred and
 * stated, same doctrine as the HTTPS boundary (docs/decisions-v0.1.md §17–18).
 * The SHA256 printed at the end is what a release attaches, so the download
 * can at least be verified against the announcement (Sovereign's pattern).
 */
const root = join(import.meta.dirname, '..');
const out = join(root, 'dist-companion');
mkdirSync(out, { recursive: true });

const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit', shell: true });

console.log('[1/3] bundling companion → dist-companion/companion.cjs');
run(
  'npx esbuild companion/index.ts --bundle --platform=node --format=cjs ' +
    '--target=node20 --outfile=dist-companion/companion.cjs ' +
    '--define:process.env.NODE_ENV=\\"production\\" --log-level=warning'
);

console.log('[2/3] preparing the SEA blob');
writeFileSync(
  join(out, 'sea-config.json'),
  JSON.stringify(
    {
      main: 'dist-companion/companion.cjs',
      output: 'dist-companion/sea-prep.blob',
      disableExperimentalSEAWarning: true
    },
    null,
    2
  )
);
run('node --experimental-sea-config dist-companion/sea-config.json');

console.log('[3/3] injecting into a copy of node.exe');
const exe = join(out, 'spotter-companion.exe');
copyFileSync(process.execPath, exe);
run(
  `npx --yes postject "${exe}" NODE_SEA_BLOB dist-companion/sea-prep.blob ` +
    '--sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
);

const sha = createHash('sha256').update(readFileSync(exe)).digest('hex');
const mb = (statSync(exe).size / 1024 / 1024).toFixed(1);
console.log(`\n✓ dist-companion/spotter-companion.exe (${mb} MB)`);
console.log(`  SHA256: ${sha}`);
console.log('  Unsigned — SmartScreen will warn once; data dir stays ~/.spotter-companion.');
