import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build runs from any folder (itch.io, zip, file host).
  base: './',
  // Fixed ports (Vite's defaults 5173/4173 are taken by another project on this machine).
  server: { port: 5280, strictPort: true },
  preview: { port: 4280, strictPort: true },
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
