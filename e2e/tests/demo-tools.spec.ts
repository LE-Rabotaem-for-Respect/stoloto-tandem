import { expect, test } from '../support/fixtures';

const HOUR_MS = 3_600_000;

test.describe('инструменты e2e: сброс демо-данных и вход под демо-аккаунтом', () => {
  test('перемотка часов в одном тесте…', async ({ request }) => {
    const shifted = await request.post('/api/demo/clock', { data: { addSeconds: 86_400 } });
    expect(shifted.ok()).toBe(true);
  });

  test('…не видна в следующем: перед каждым тестом данные сброшены', async ({ request }) => {
    const clock = await (await request.get('/api/clock')).json();
    const drift = Math.abs(Date.parse(clock.now) - Date.parse(clock.lastResetAt));
    expect(clock.lastResetAt).not.toBeNull();
    expect(drift).toBeLessThan(HOUR_MS);
  });

  test('гость не вошёл', async ({ page }) => {
    const me = await page.request.get('/api/me');
    expect(me.status()).toBe(401);
  });

  test('loginAs входит под пользователем в контексте страницы', async ({ page, loginAs }) => {
    await loginAs('anna');
    const me = await page.request.get('/api/me');
    expect(me.status()).toBe(200);
    expect(await me.json()).toMatchObject({ email: 'anna@demo', role: 'user', name: 'Анна' });
  });

  test('loginAs входит под организацией', async ({ page, loginAs }) => {
    await loginAs('ladya');
    const me = await (await page.request.get('/api/me')).json();
    expect(me).toMatchObject({ role: 'org', organization: { status: 'approved' } });
  });
});
