import { build } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

process.env.BROWSER = 'firefox';
await build();

const manifestPath = join('dist-firefox', 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));

if (manifest.background?.service_worker) {
  manifest.background = {
    scripts: [manifest.background.service_worker],
    type: 'module'
  };
}
manifest.browser_specific_settings = {
  gecko: { id: 'spotter@clenoble.dev', strict_min_version: '115.0' }
};

await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
console.log('✓ Firefox build complete → dist-firefox/ (manifest patched for Gecko)');
