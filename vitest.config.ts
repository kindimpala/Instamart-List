import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    env: { LOG_LEVEL: 'silent', SESSION_SECRET: 'test-secret-test-secret-test-secret' },
  },
});
