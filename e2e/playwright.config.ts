import { defineConfig, devices } from '@playwright/test';

// Тесты идут против уже запущенного приложения: `docker compose up` или стенда.
// Один поток: перед каждым тестом сбрасываются демо-данные всего стенда.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8080',
    // Пояс пользователей платформы (DECISION-002): даты в сценариях не зависят от пояса runner'а
    timezoneId: 'Asia/Krasnoyarsk',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});
