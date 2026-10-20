import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures';
import { fillEventForm, navLink, standDate, switchAccount } from '../support/scenario';

const PADEL = 'Падел-клуб Енисей';
const STOLBY = 'Беговой клуб «Столбы»';

/** Степпер «Путь организации» на экране «Моя организация». */
const orgStepper = (page: Page) => page.getByRole('list', { name: /^Путь организации/ });

/** Строка организации в админке. */
const adminRow = (page: Page, name: string) =>
  page.locator('.admin-row').filter({ has: page.getByRole('heading', { name, exact: true }) });

// ТЗ 4.7, сценарий 2 (docs/scenarios.md): обе ветки подряд, без сброса между ними
test('сценарий 2: допуск организации, публикация от её имени и отказ с причиной', async ({
  page,
  loginAs,
}) => {
  // 1. padel@demo: степпер на шаге «Проверка», «На рассмотрении», создать событие нельзя
  await loginAs('padel');
  await page.goto('/organization');
  await expect(orgStepper(page).locator('[aria-current="step"]')).toHaveText('Проверка');
  await expect(page.getByText('На рассмотрении')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Создать мероприятие' })).toHaveCount(0);

  // 2. Администратор: плитка «Заявки организаций ждут решения» → в очереди обе организации
  await switchAccount(page, 'Администратор');
  await page.goto('/admin');
  await page.getByRole('link', { name: /^Заявки организаций ждут решения: \d+$/ }).click();
  await expect(page).toHaveURL(/\/admin\/organizations\?status=pending/);
  await expect(adminRow(page, PADEL)).toBeVisible();
  await expect(adminRow(page, STOLBY)).toBeVisible();

  // 3. «Одобрить» → заявка ушла из очереди
  await adminRow(page, PADEL).getByRole('button', { name: 'Одобрить' }).click();
  await expect(adminRow(page, PADEL)).toHaveCount(0);

  // 4. padel@demo входит снова: степпер на шаге «Публикуйте события», заявка одобрена
  await switchAccount(page, PADEL);
  await page.goto('/organization');
  await expect(orgStepper(page).locator('[aria-current="step"]')).toHaveText('Публикуйте события');
  await expect(page.getByText('Допущена к публикации')).toBeVisible();

  // 5. «Создать» → «Падел для начинающих» → публикуется сразу, без согласования
  await navLink(page, 'Создать').click();
  await fillEventForm(page, {
    title: 'Падел для начинающих',
    sport: 'Падел',
    description: 'Правила, хват ракетки и первые розыгрыши, ракетки выдаём',
    date: await standDate(page, 2),
    startTime: '18:00',
    endTime: '19:30',
    city: 'Красноярск',
    area: 'Советский район',
    placeText: 'Корты клуба, вход со двора',
    level: 'Новичок',
    mode: 'Свободно',
  });
  await page.getByRole('button', { name: 'Опубликовать' }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
  await expect(page.locator('.event-card-action')).toContainText('Набор открыт');
  await expect(page.locator('.event-card-organizer')).toContainText(PADEL);

  // 6. Анна находит событие в ленте → карточка → ссылка на организатора
  await switchAccount(page, 'Анна');
  await navLink(page, 'Найти').click();
  await page.getByRole('searchbox', { name: 'Поиск по названию и направлению' }).fill('падел');
  await page.getByRole('button', { name: 'Найти', exact: true }).click();
  await page.getByRole('link', { name: /Падел для начинающих/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Падел для начинающих' })).toBeVisible();
  await page.locator('.event-card-organizer').getByRole('link', { name: PADEL }).click();
  await expect(page).toHaveURL(/\/organizations\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: PADEL })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Падел для начинающих' })).toBeVisible();

  // 7. Администратор: «Столбы» → «Отклонить» без причины нельзя
  await switchAccount(page, 'Администратор');
  await page.goto('/admin/organizations?status=pending');
  const stolby = adminRow(page, STOLBY);
  await stolby.getByRole('button', { name: 'Отклонить' }).click();
  const reason = stolby.getByLabel('Причина отказа — её увидит организация');
  await stolby.getByRole('button', { name: 'Отклонить с этой причиной' }).click();
  expect(await reason.evaluate((field: HTMLTextAreaElement) => field.validity.valueMissing)).toBe(
    true,
  );
  await expect(stolby).toBeVisible();

  // 8. С причиной → заявка ушла из очереди
  await reason.fill('Не указаны контакты представителя');
  await stolby.getByRole('button', { name: 'Отклонить с этой причиной' }).click();
  await expect(adminRow(page, STOLBY)).toHaveCount(0);

  // 9. stolby@demo: шаг «Решение» — «Отклонена» и причина; можно отправить на проверку снова
  await switchAccount(page, STOLBY);
  await page.goto('/organization');
  const decision = orgStepper(page).locator('[data-state="error"]');
  await expect(decision).toContainText('Решение: отклонена');
  await expect(decision).toContainText('Не указаны контакты представителя');
  await expect(page.getByRole('button', { name: 'Отправить на проверку' })).toBeEnabled();
});
