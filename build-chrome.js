import { build } from 'vite';

process.env.BROWSER = 'chrome';
await build();
console.log('✓ Chrome build complete → dist-chrome/');
