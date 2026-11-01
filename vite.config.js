import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/* base './' — відносні шляхи: збірка працює і на GitHub Pages (/<repo>/), і з будь-якої папки.
 * Режим single (npm run build:single) — один HTML з усім інлайном, у dist-single/. */
export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 1200
  },
  plugins: mode === 'single' ? [viteSingleFile()] : []
}));
