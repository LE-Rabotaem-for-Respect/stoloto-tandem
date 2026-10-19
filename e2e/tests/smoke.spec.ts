import { expect, test } from '@playwright/test';

test('приложение открывается, API отвечает', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Столото: спорт вместе' })).toBeVisible();

  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({ status: 'ok' });
});
