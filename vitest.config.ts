import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks',
    testTimeout: 60000,
    hookTimeout: 60000,
    teardownTimeout: 60000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
