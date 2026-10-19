import { expect, test } from '../support/fixtures';

test('браузер тестов живёт по времени Красноярска, как пользователи платформы', async ({
  page,
}) => {
  await page.goto('/');
  const timeZone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  expect(timeZone).toBe('Asia/Krasnoyarsk');
});
