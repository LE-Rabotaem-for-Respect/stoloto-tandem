import type { Page } from '@playwright/test';
import { TIME_ZONE } from '@tandem/domain';
import { expect } from './fixtures';

const DAY_MS = 86_400_000;

/** Дата через `days` дней по часам стенда — в виде ГГГГ-ММ-ДД, как в поле даты. */
export async function standDate(page: Page, days: number): Promise<string> {
  const clock = await (await page.request.get('/api/clock')).json();
  const at = new Date(Date.parse(clock.now) + days * DAY_MS);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(at);
}

/** Пункт главного меню: на всех ширинах меню одно. */
export const navLink = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Основные разделы' }).getByRole('link', { name });

/** «Сменить аккаунт» в шапке → «Быстрый вход для проверки» под другим демо-аккаунтом. */
export async function switchAccount(page: Page, accountName: string): Promise<void> {
  await page.getByRole('button', { name: 'Сменить аккаунт' }).click();
  const quick = page.getByRole('region', { name: 'Быстрый вход для проверки' });
  await quick.getByRole('button', { name: new RegExp(`^${accountName}`) }).click();
  await expect(page.getByText(`Вы вошли как ${accountName}`)).toBeAttached();
}

export interface NewEvent {
  title: string;
  /** Направление из каталога или новое — тогда `newSport: true`. */
  sport: string;
  newSport?: boolean;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  city: string;
  area: string;
  placeText: string;
  level: string;
  mode: 'Свободно' | 'По заявке';
}

/**
 * Форма «Создать» по шагам до предпросмотра (ТЗ 2.2): каждый шаг без ошибок.
 * Кнопку «Опубликовать» нажимает тест.
 */
export async function fillEventForm(page: Page, event: NewEvent): Promise<void> {
  const form = page.locator('form.create-event');
  await expect(page.getByRole('heading', { name: 'Шаг 1 из 4: Что' })).toBeVisible();
  await form.getByLabel('Название').fill(event.title);
  const sport = form.getByRole('combobox', { name: 'Направление' });
  await sport.fill(event.sport);
  const option = event.newSport
    ? `Добавить «${event.sport}» как новое направление`
    : new RegExp(`^${event.sport}$`);
  await page.getByRole('option', { name: option }).click();
  await expect(sport).toHaveValue(event.sport);
  await form.getByLabel('Описание').fill(event.description);
  await form.getByRole('button', { name: 'Далее' }).click();

  await expect(page.getByRole('heading', { name: 'Шаг 2 из 4: Когда и где' })).toBeVisible();
  await form.getByLabel('Дата').fill(event.date);
  await form.getByLabel('Начало').fill(event.startTime);
  await form.getByLabel('Окончание').fill(event.endTime);
  await form.getByLabel('Город').fill(event.city);
  await form.getByLabel('Район или ориентир').fill(event.area);
  await form.getByLabel('Адрес или как найти место').fill(event.placeText);
  await form.getByRole('button', { name: 'Далее' }).click();

  await expect(page.getByRole('heading', { name: 'Шаг 3 из 4: Условия' })).toBeVisible();
  await form.getByRole('radio', { name: event.level, exact: true }).check();
  await form.getByRole('button', { name: 'Далее' }).click();

  await expect(page.getByRole('heading', { name: 'Шаг 4 из 4: Запись' })).toBeVisible();
  await form.getByRole('radio', { name: new RegExp(`^${event.mode}`) }).check();
  await expect(form.locator('[aria-invalid="true"]')).toHaveCount(0);
}
