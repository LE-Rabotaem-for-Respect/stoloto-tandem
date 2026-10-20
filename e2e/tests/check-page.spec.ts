import { expect, test } from '../support/fixtures';

test.describe('страница «Как проверить»', () => {
  test('кнопка входа в сценарии входит под демо-аккаунтом и открывает экран', async ({ page }) => {
    await page.goto('/check');
    const scenario = page.getByRole('region', { name: /Сценарий 1/ });
    await scenario.getByRole('button', { name: 'Войти как Анна' }).first().click();
    await expect(page).toHaveURL(/\/create$/);
    const me = await (await page.request.get('/api/me')).json();
    expect(me.email).toBe('anna@demo');
  });

  test('стенды и docs/scenarios.md', async ({ page }) => {
    await page.goto('/check');
    const stands = page.getByRole('region', { name: 'Стенды' });
    await expect(stands.getByRole('link')).toHaveCount(3);
    await page.getByRole('link', { name: 'docs/scenarios.md' }).click();
    await expect(
      page.getByRole('heading', { name: 'Сценарий 6. Снятие с публикации' }),
    ).toBeVisible();
  });
});
