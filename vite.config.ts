import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Patched dependency bytes are not part of Vite's normal lockfile cache key.
const fontkitPatch = createHash('sha256')
  .update(readFileSync(new URL('./tools/patch-fontkit.mjs', import.meta.url)))
  .digest('hex')
  .slice(0, 12);

export default defineConfig({
  cacheDir: `node_modules/.vite/fontkit-${fontkitPatch}`,
  base: './',
  plugins: [react()],
  test: { include: ['tests/**/*.test.ts'] },
  server: { host: '127.0.0.1' },
  build: { target: 'es2022' },
});
