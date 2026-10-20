import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures';

const TITLE = 'Блиц-турнир в клубе «Ладья»';
const REASON = 'Турнир перенесён клубом, сведения устарели';

async function feedTitles(page: Page, query: string): Promise<string[]> {
  const feed = await page.request.get('/api/events', { params: { q: query } });
  expect(feed.ok(), `Лента «${query}»: ${feed.status()}`).toBe(true);
  return ((await feed.json()).items as { title: string }[]).map((item) => item.title);
}

/** Баннер снятого мероприятия: статус и причина модератора (строка полного статуса). */
async function expectUnpublishedBanner(page: Page) {
  await expect(page.getByText(/Снято с публикации модератором/).first()).toBeVisible();
  await expect(page.getByText(new RegExp(`Причина: ${REASON}`)).first()).toBeVisible();
}

// docs/scenarios.md, сценарий 6 «Снятие с публикации» (ТЗ 4.7)
test('сценарий 6: администратор снимает «Блиц-турнир» с причиной — в ленте его нет, записаться нельзя, участники видят причину', async ({
  page,
  loginAs,
}) => {
  // 1. Анна находит «Блиц-турнир» и запоминает адрес карточки
  await loginAs('anna');
  const found = await page.request.get('/api/events', { params: { q: 'блиц' } });
  const item = ((await found.json()).items as { id: string; title: string }[]).find(
    (event) => event.title === TITLE,
  );
  expect(item, '«Блиц-турнир» есть в ленте до снятия').toBeTruthy();
  const id = item?.id ?? '';
  await page.goto(`/events/${id}`);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();

  // 2. Администратор: без причины снять нельзя
  await loginAs('admin');
  await page.goto(`/admin/events?q=${encodeURIComponent('Блиц')}`);
  const row = page.locator('li.admin-row', { hasText: TITLE });
  await row.getByRole('button', { name: 'Снять с публикации' }).click();
  const reason = row.getByLabel('Причина — её увидят организатор и записавшиеся');
  await row.getByRole('button', { name: 'Снять с этой причиной' }).click();
  await expect(reason).toBeVisible();
  expect(await feedTitles(page, 'блиц')).toContain(TITLE);

  // 3. С причиной — снято
  await reason.fill(REASON);
  await row.getByRole('button', { name: 'Снять с этой причиной' }).click();
  await expect(row.getByText('Снято с публикации', { exact: true })).toBeVisible();
  await expect(row).toContainText(REASON);

  // 4. Ни в ленте, ни в поиске его нет
  await loginAs('anna');
  expect(await feedTitles(page, 'блиц')).not.toContain(TITLE);
  expect(await feedTitles(page, '')).not.toContain(TITLE);
  await page.goto(`/?q=${encodeURIComponent('блиц')}`);
  await expect(page.getByRole('link', { name: new RegExp(TITLE) })).toHaveCount(0);

  // 5. По адресу — «Мероприятие недоступно», кнопки записи нет
  await page.goto(`/events/${id}`);
  await expect(page.getByText('Мероприятие недоступно').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Записаться|Подать заявку/ })).toHaveCount(0);

  // 6. Запись запросом к api — 409 «Мероприятие недоступно для записи»
  const join = await page.request.post(`/api/events/${id}/join`);
  expect(join.status()).toBe(409);
  expect((await join.json()).message).toBe('Мероприятие недоступно для записи');

  // 7. Участница Мария (фоновый участник: вход почтой и паролем demo) видит баннер и уведомление
  const maria = await page.request.post('/api/auth/login', {
    data: { email: 'maria@demo', password: 'demo' },
  });
  expect(maria.ok(), `Вход maria@demo: ${maria.status()}`).toBe(true);
  await page.goto(`/events/${id}`);
  await expectUnpublishedBanner(page);
  await page.goto('/notifications');
  await expect(page.getByText(TITLE).first()).toBeVisible();

  // 8. Организатор «Ладья» — тот же баннер и уведомление
  await loginAs('ladya');
  await page.goto(`/events/${id}`);
  await expectUnpublishedBanner(page);
  await page.goto('/notifications');
  await expect(page.getByText(TITLE).first()).toBeVisible();
});
