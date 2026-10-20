import { expect, test } from '../support/fixtures';
import { fillEventForm, navLink, standDate, switchAccount } from '../support/scenario';

// ТЗ 4.7, сценарий 1 (docs/scenarios.md): событие с новым направлением находят другие
test('сценарий 1: Анна создаёт событие с новым направлением, Игорь находит его поиском и фильтром', async ({
  page,
  loginAs,
}) => {
  await loginAs('anna');
  await page.goto('/');

  // 1–3. «Создать», новое направление «Кёрлинг на льду», группа по умолчанию — «Другое»
  await navLink(page, 'Создать').click();
  const form = page.locator('form.create-event');
  await form.getByRole('combobox', { name: 'Направление' }).fill('Кёрлинг на льду');
  // Совпадений в каталоге нет: единственный пункт — «Добавить … как новое направление»
  await expect(page.getByRole('option')).toHaveCount(1);
  await page
    .getByRole('option', { name: 'Добавить «Кёрлинг на льду» как новое направление' })
    .click();
  const group = form.getByLabel('Группа нового направления (необязательно)');
  await expect(group.locator('option:checked')).toHaveText('Другое — по умолчанию');
  await form.getByRole('combobox', { name: 'Направление' }).clear();

  // 4. Все шаги без ошибок, на последнем — предпросмотр будущей карточки
  await fillEventForm(page, {
    title: 'Кёрлинг для новичков',
    sport: 'Кёрлинг на льду',
    newSport: true,
    description: 'Учимся держать камень и щётку, лёд и инвентарь — на месте',
    date: await standDate(page, 3),
    startTime: '19:00',
    endTime: '21:00',
    city: 'Красноярск',
    area: 'Центральный',
    placeText: 'Каток на острове Татышев, у раздевалок',
    level: 'Новичок',
    mode: 'По заявке',
  });
  const preview = page.getByRole('region', { name: 'Так увидят участники' });
  await expect(preview.getByRole('heading', { name: 'Кёрлинг для новичков' })).toBeVisible();
  await expect(preview.getByText('Кёрлинг на льду')).toBeVisible();
  await expect(
    preview.getByText('Красноярск, Центральный, Каток на острове Татышев'),
  ).toBeVisible();

  // 5. «Опубликовать» → карточка события; событие есть в ленте
  await form.getByRole('button', { name: 'Опубликовать' }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Кёрлинг для новичков' })).toBeVisible();
  await expect(page.locator('.event-card-first')).toContainText('Набор открыт');
  // Новое направление — пользовательское, в группе «Другое» (ТЗ 2.3)
  const eventId = page.url().split('/').pop();
  const published = await (await page.request.get(`/api/events/${eventId}`)).json();
  expect(published.sport).toMatchObject({
    name: 'Кёрлинг на льду',
    category: 'other',
    isCustom: true,
  });
  await navLink(page, 'Найти').click();
  await expect(page.getByRole('link', { name: /Кёрлинг для новичков/ })).toBeVisible();

  // 6. Игорь: «Найти» → поиск «кёрлинг»
  await switchAccount(page, 'Игорь');
  await navLink(page, 'Найти').click();
  await page.getByRole('searchbox', { name: 'Поиск по названию и направлению' }).fill('кёрлинг');
  await page.getByRole('button', { name: 'Найти', exact: true }).click();
  await expect(page).toHaveURL(/[?&]q=/);
  const results = page.locator('.feed-list');
  await expect(results.getByRole('link', { name: /Кёрлинг для новичков/ })).toBeVisible();

  // 7. Без поиска — фильтр по новому направлению: в выдаче только это событие
  await navLink(page, 'Найти').click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await page.locator('summary', { hasText: 'Фильтры' }).click();
  await page.getByRole('combobox', { name: 'Направление' }).fill('Кёрлинг на льду');
  await page
    .getByRole('listbox', { name: 'Подсказки' })
    .getByRole('option', { name: 'Кёрлинг на льду', exact: true })
    .click();
  await expect(page).toHaveURL(/[?&]sport=[0-9a-f-]{36}/);
  await expect(page.locator('summary', { hasText: 'Фильтры · 1' })).toBeVisible();
  await expect(results.locator(':scope > li')).toHaveCount(1);
  await expect(results.getByRole('link', { name: /Кёрлинг для новичков/ })).toBeVisible();
});
