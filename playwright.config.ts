import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'file://' + __dirname,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
