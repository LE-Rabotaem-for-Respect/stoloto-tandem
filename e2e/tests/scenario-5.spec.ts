import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures';

/** id мероприятия по названию — из ленты, как его нашёл бы человек. */
async function eventId(page: Page, query: string): Promise<string> {
  const feed = await page.request.get('/api/events', { params: { q: query } });
  expect(feed.ok(), `Лента «${query}»: ${feed.status()}`).toBe(true);
  const [first] = (await feed.json()).items as { id: string }[];
  expect(first, `«${query}» нет в ленте`).toBeTruthy();
  return first?.id ?? '';
}

const discussion = (page: Page) => page.locator('#discussion');

/** Вопрос верхнего уровня вместе с ответами на него. */
const thread = (page: Page, text: string) =>
  discussion(page).locator('li.thread', { hasText: text });

const QUESTION = 'Можно прийти без команды?';
const ANSWER = 'Да, команды делим на месте';

// docs/scenarios.md, сценарий 5 «Уточнение условий» (ТЗ 4.7)
test('сценарий 5: Анна спрашивает в обсуждении «Футбола», Игорь отвечает с меткой «Организатор»', async ({
  page,
  loginAs,
}) => {
  const id = await eventId(page, 'Футбол 7×7');

  // 1. Видны вопрос Дмитрия и ответ Игоря с меткой «Организатор»
  await loginAs('anna');
  await page.goto(`/events/${id}`);
  const seeded = thread(page, 'Нужны бутсы или можно в кроссовках?');
  await expect(seeded.getByRole('article', { name: 'Сообщение: Дмитрий' })).toBeVisible();
  const seededAnswer = seeded.getByRole('article', { name: 'Сообщение: Игорь' });
  await expect(seededAnswer).toContainText('Организатор');

  // 2. Анна пишет вопрос — он в обсуждении с автором и временем
  await discussion(page).getByLabel('Ваш вопрос организатору и участникам').fill(QUESTION);
  await discussion(page).getByRole('button', { name: 'Отправить' }).click();
  const asked = thread(page, QUESTION).getByRole('article', { name: 'Сообщение: Анна' });
  await expect(asked).toContainText(QUESTION);
  await expect(asked.locator('time')).toBeVisible();
  await expect(asked).not.toContainText('Организатор');

  // 3–4. Игорь видит вопрос Анны и отвечает под ним
  await loginAs('igor');
  await page.goto(`/events/${id}`);
  const question = thread(page, QUESTION);
  await expect(question.getByRole('article', { name: 'Сообщение: Анна' })).toBeVisible();
  await question.getByRole('button', { name: 'Ответить' }).click();
  await question.getByLabel('Ответ: Анна').fill(ANSWER);
  await question.getByRole('button', { name: 'Ответить' }).click();
  const reply = question
    .getByRole('list', { name: 'Ответы: Анна' })
    .getByRole('article', { name: 'Сообщение: Игорь' });
  await expect(reply).toContainText(ANSWER);
  await expect(reply).toContainText('Организатор');

  // 5. Анна видит ответ Игоря под своим вопросом с меткой «Организатор»
  await loginAs('anna');
  await page.goto(`/events/${id}`);
  const answered = thread(page, QUESTION)
    .getByRole('list', { name: 'Ответы: Анна' })
    .getByRole('article', { name: 'Сообщение: Игорь' });
  await expect(answered).toContainText(ANSWER);
  await expect(answered).toContainText('Организатор');
});
