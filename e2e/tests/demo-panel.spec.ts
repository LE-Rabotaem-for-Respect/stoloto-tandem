import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures';

/** Панель; на мобильном инструменты свёрнуты — раскрыть их. */
async function demoPanel(page: Page) {
  const panel = page.getByRole('region', { name: 'Демо-панель' });
  await expect(panel).toBeVisible();
  const toggle = panel.getByRole('button', { name: 'Инструменты' });
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
  return panel;
}

const standNow = async (page: Page) =>
  Date.parse((await (await page.request.get('/api/clock')).json()).now);

test.describe('демо-панель на стенде', () => {
  test('видна и гостю: время последнего сброса и время стенда', async ({ page }) => {
    await page.goto('/');
    const panel = await demoPanel(page);
    await expect(panel.getByText(/Сброс: /)).toBeVisible();
    await expect(panel.getByText(/Время стенда: /)).toBeVisible();
  });

  test('на мобильном панель свёрнута в одну строку', async ({ page }) => {
    await page.goto('/');
    const panel = page.getByRole('region', { name: 'Демо-панель' });
    const toggle = panel.getByRole('button', { name: 'Инструменты' });
    test.skip(!(await toggle.isVisible()), 'на широком экране панель развёрнута всегда');
    const box = await panel.boundingBox();
    expect(box?.height ?? 0).toBeLessThanOrEqual(80);
  });

  test('«+1 день» переводит часы стенда', async ({ page }) => {
    await page.goto('/');
    const panel = await demoPanel(page);
    const before = await standNow(page);
    await panel.getByRole('button', { name: '+1 день' }).click();
    await expect
      .poll(async () => (await standNow(page)) - before)
      .toBeGreaterThanOrEqual(86_400_000);
  });

  test('сброс с подтверждением возвращает исходные данные и выходит из аккаунта', async ({
    page,
    loginAs,
  }) => {
    await loginAs('anna');
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Сменить аккаунт' })).toBeVisible();
    const panel = await demoPanel(page);
    const time = panel.getByText(/Время стенда: /);
    const shown = await time.textContent();
    await panel.getByRole('button', { name: '+1 час' }).click();
    // Перемотка дошла до стенда: время в панели сменилось
    await expect(time).not.toHaveText(shown ?? '');
    await panel.getByRole('button', { name: 'Сбросить демо-данные' }).click();
    await panel.getByRole('button', { name: 'Да, сбросить' }).click();
    await expect(page.getByRole('link', { name: 'Войти' })).toBeVisible();
    const clock = await (await page.request.get('/api/clock')).json();
    expect(Math.abs(Date.parse(clock.now) - Date.parse(clock.lastResetAt))).toBeLessThan(3_600_000);
  });
});
