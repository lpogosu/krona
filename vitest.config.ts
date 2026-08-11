import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Пакеты рабочей области импортируются из исходников: тестам не нужна сборка ядра.
    conditions: ['source'],
  },
  ssr: {
    resolve: { conditions: ['source'] },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/cli/test/**/*.test.ts', 'apps/web/src/**/*.test.ts'],
    server: {
      deps: {
        // Без этого Vitest отдаёт пакет из node_modules самому Node, а тот берёт dist —
        // и тесты CLI молча проверяют прошлую сборку ядра.
        inline: [/@krona\//],
      },
    },
  },
});
