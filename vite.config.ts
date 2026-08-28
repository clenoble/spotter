import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'node:path';
import manifest from './src/manifest.json';

const isFirefox = process.env.BROWSER === 'firefox';

// We always let @crxjs build a Chrome-style manifest, then patch it in
// build-firefox.js for Gecko. @crxjs v2's Firefox mode has open issues with
// module service workers; post-build patching is the stable path today.
export default defineConfig({
  plugins: [svelte(), crx({ manifest })],
  resolve: {
    alias: {
      $lib: resolve('src/lib'),
      $shared: resolve('src/shared'),
      $core: resolve('src/core')
    }
  },
  build: {
    outDir: isFirefox ? 'dist-firefox' : 'dist-chrome',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        dashboard: resolve('src/dashboard/index.html')
      }
    }
  }
});
