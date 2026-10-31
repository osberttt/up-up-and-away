import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // Relative asset paths so the build runs from any folder (itch.io, zip, file host).
  base: './',
  // Fixed ports (Vite's defaults 5173/4173 are taken by another project on this machine).
  server: { port: 5280, strictPort: true },
  preview: { port: 4280, strictPort: true },
  // The release version, shown in the pause menu so the build can be matched to the repo tag.
  define: { __VERSION__: JSON.stringify(version) },
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
