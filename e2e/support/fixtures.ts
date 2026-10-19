import { test as base, expect } from '@playwright/test';
import type { DemoAccountKey } from '@tandem/domain';

interface DemoFixtures {
  /** Сброс демо-данных стенда перед каждым тестом: сценарии независимы (ТЗ 4.7). */
  freshDemo: undefined;
  /** Вход под демо-аккаунтом быстрого входа; cookie сессии — у страницы теста. */
  loginAs: (account: DemoAccountKey) => Promise<void>;
}

/**
 * Тесты e2e: каждый начинается со «Сбросить демо-данные». Тесты идут в один
 * поток (`workers: 1`): стенд и его сброс общие для всех.
 */
export const test = base.extend<DemoFixtures>({
  freshDemo: [
    async ({ request }, use) => {
      const reset = await request.post('/api/demo/reset');
      expect(reset.ok(), `Сброс демо-данных: ${reset.status()} ${await reset.text()}`).toBe(true);
      await use(undefined);
    },
    { auto: true },
  ],

  loginAs: async ({ page }, use) => {
    await use(async (account) => {
      const login = await page.request.post('/api/auth/demo-login', { data: { account } });
      expect(login.ok(), `Быстрый вход «${account}»: ${login.status()}`).toBe(true);
    });
  },
});

export { expect };
