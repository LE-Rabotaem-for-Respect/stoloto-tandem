import { expect, test } from '../support/fixtures';
import { navLink, switchAccount } from '../support/scenario';

const BLITZ = 'Блиц-турнир в клубе «Ладья»';

// ТЗ 4.7, сценарий 3 (docs/scenarios.md): свободное присоединение
test('сценарий 3: свободная запись — «Вы участник», информация участникам, у «Ладьи» в списке', async ({
  page,
  loginAs,
}) => {
  // 1. Анна открывает «Блиц-турнир»: свободно, любой уровень, главная кнопка «Записаться»
  await loginAs('anna');
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Поиск по названию и направлению' }).fill('Блиц');
  await page.getByRole('button', { name: 'Найти', exact: true }).click();
  await page.getByRole('link', { name: new RegExp(BLITZ) }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
  const eventUrl = page.url();
  const first = page.locator('.event-card-first');
  await expect(first).toContainText('Свободно');
  await expect(first).toContainText('Любой уровень');
  await expect(page.getByRole('heading', { name: 'Информация для участников' })).toHaveCount(0);

  // 2. «Записаться» → «Вы участник» с галочкой, появилась «Информация для участников»
  await page.getByRole('button', { name: 'Записаться' }).click();
  const mine = page.getByRole('region', { name: 'Ваша запись' });
  await expect(mine.locator('.status-text')).toHaveText('Вы участник');
  await expect(mine.getByRole('list', { name: 'Запись: вы участник' })).toBeVisible();
  await expect(mine.getByRole('heading', { name: 'Информация для участников' })).toBeVisible();
  await expect(mine).toContainText('Назовите на входе фамилию');

  // 3. «Мои записи» → «Блиц-турнир» в «Предстоящих»
  await navLink(page, 'Мои записи').click();
  const upcoming = page.getByRole('region', { name: 'Предстоящие' });
  await expect(upcoming.getByRole('link', { name: new RegExp(BLITZ) })).toBeVisible();

  // 4. «Ладья»: «Участники и заявки» → Анна вместе с Марией и Павлом
  await switchAccount(page, 'Шахматный клуб «Ладья»');
  await page.goto(eventUrl);
  await page.getByRole('tab', { name: 'Участники и заявки' }).click();
  const people = page.getByRole('region', { name: /^Участники \d+$/ });
  for (const name of ['Анна', 'Мария', 'Павел']) {
    await expect(people.getByText(name, { exact: true })).toBeVisible();
  }
});
