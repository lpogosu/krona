import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * `KRONA_BASE=/krona/` собирает демо для GitHub Pages: сайт проекта живёт под именем
 * репозитория. Локально и в контейнере приложение отдаётся из корня.
 */
export default defineConfig({
  base: process.env['KRONA_BASE'] ?? '/',
  plugins: [react()],
  resolve: {
    // Ядро подключается из исходников — сборка не зависит от того, собран ли пакет отдельно.
    conditions: ['source'],
  },
  worker: {
    format: 'es',
  },
  build: {
    outDir: 'dist',
    assetsDir: 'bundle',
    sourcemap: true,
  },
});
