import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      // Üretimde Electron çalışma zamanı; testlerde IPC sözleşmesini gerçek
      // çağrı yolu üzerinden sınamak için taklit kullanılır.
      electron: fileURLToPath(new URL('./tests/stubs/electron.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: { reporter: ['text', 'html'] },
  },
});
