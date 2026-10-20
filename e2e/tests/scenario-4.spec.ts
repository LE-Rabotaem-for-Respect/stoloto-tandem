import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures';
import { navLink, switchAccount } from '../support/scenario';

const CLIMBING = 'Скалолазание для начинающих';
const REASON = 'Занятие для взрослых, детская группа — по субботам';

/** Заявка или запись по имени в разделе «Участников и заявок». */
const person = (page: Page, group: RegExp, name: string) =>
  page
    .getByRole('region', { name: group })
    .locator('li')
    .filter({ has: page.getByText(name, { exact: true }) });

/** Ксения — фоновый участник без быстрого входа: почта и пароль демо-сида. */
async function signInAsKsenia(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Сменить аккаунт' }).click();
  await page.getByLabel('Почта').fill('ksenia@demo');
  await page.getByLabel('Пароль').fill('demo');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByText('Вы вошли как Ксения')).toBeAttached();
}

// ТЗ 4.7, сценарий 4 (docs/scenarios.md): участие по заявке, решение организатора
test('сценарий 4: заявка с ответом, решение Игоря, статусы и уведомления у обеих сторон', async ({
  page,
  loginAs,
}) => {
  // 1–2. Анна: «Подать заявку» → форма с вопросом «Ваш опыт?» → ответ → «На рассмотрении»
  await loginAs('anna');
  await page.goto('/');
  await page
    .getByRole('searchbox', { name: 'Поиск по названию и направлению' })
    .fill('Скалолазание');
  await page.getByRole('button', { name: 'Найти', exact: true }).click();
  await page.getByRole('link', { name: new RegExp(CLIMBING) }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
  const eventUrl = page.url();
  await page.getByRole('button', { name: 'Подать заявку' }).click();
  await page.getByLabel('Ваш опыт?').fill('Был один раз на скалодроме');
  await page.getByRole('button', { name: 'Отправить заявку' }).click();
  const mine = page.getByRole('region', { name: 'Ваша запись' });
  await expect(mine.locator('.status-text')).toHaveText('Заявка на рассмотрении');
  await expect(page.getByRole('heading', { name: 'Информация для участников' })).toHaveCount(0);

  // 3. Игорь: уведомление «Новая заявка»
  await switchAccount(page, 'Игорь');
  await navLink(page, 'Уведомления').click();
  await expect(page.getByText(`Новая заявка на «${CLIMBING}»`).first()).toBeVisible();

  // 4. «Участники и заявки» → «Ждут решения»: Ксения, Артём и Анна с ответом
  await page.goto(eventUrl);
  await page.getByRole('tab', { name: 'Участники и заявки' }).click();
  const waiting = /^Ждут решения \d+$/;
  for (const name of ['Ксения', 'Артём', 'Анна']) {
    await expect(person(page, waiting, name)).toBeVisible();
  }
  await expect(person(page, waiting, 'Анна')).toContainText('Был один раз на скалодроме');

  // 5. Заявка Анны → «Принять» → Анна в списке участников
  await person(page, waiting, 'Анна').getByRole('button', { name: 'Принять' }).click();
  await expect(person(page, /^Участники \d+$/, 'Анна')).toBeVisible();

  // 6. Заявка Ксении → «Отклонить» с причиной → Ксения в архиве
  const ksenia = person(page, waiting, 'Ксения');
  await ksenia.getByRole('button', { name: 'Отклонить' }).click();
  await ksenia.getByLabel('Причина (необязательно)').fill(REASON);
  await ksenia.getByRole('button', { name: 'Отклонить заявку' }).click();
  await expect(person(page, /^Архив \d+$/, 'Ксения')).toContainText(REASON);

  // 7. Анна: «Вы участник», «Информация для участников», уведомление «Заявка принята»
  await switchAccount(page, 'Анна');
  await page.goto(eventUrl);
  await expect(mine.locator('.status-text')).toHaveText('Вы участник');
  await expect(mine.getByRole('heading', { name: 'Информация для участников' })).toBeVisible();
  await navLink(page, 'Уведомления').click();
  await expect(page.getByText(`Заявка на «${CLIMBING}» принята — вы участник`)).toBeVisible();

  // 8. Ксения: «Заявка отклонена» с причиной, «Подать заявку» неактивна, уведомление
  await signInAsKsenia(page);
  await page.goto(eventUrl);
  await expect(mine.locator('.status-text')).toHaveText('Заявка отклонена');
  await expect(mine).toContainText(REASON);
  await expect(page.getByRole('button', { name: 'Подать заявку' })).toBeDisabled();
  await navLink(page, 'Уведомления').click();
  await expect(
    page.getByText(`Заявка на «${CLIMBING}» отклонена. Причина: ${REASON}`),
  ).toBeVisible();
});
