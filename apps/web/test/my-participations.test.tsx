import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, AppRoutes, createQueryClient } from '../src/App';
import type { MyParticipation } from '../src/features/participations';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function event(id: string, title: string, overrides: Partial<MyParticipation['event']> = {}) {
  return {
    id,
    title,
    sport: { id: 's1', name: 'Бег', category: 'endurance', isCustom: false },
    organizer: { kind: 'user', id: 'o1', name: 'Олег' },
    startsAt: '2026-10-21T01:00:00Z',
    endsAt: '2026-10-21T02:00:00Z',
    city: 'Красноярск',
    area: 'Центральный',
    mode: 'free',
    level: 'any',
    displayStatus: 'open',
    ...overrides,
  } satisfies MyParticipation['event'];
}

const row = (
  id: string,
  group: MyParticipation['group'],
  status: MyParticipation['status'],
  ev: MyParticipation['event'],
  extra: Partial<MyParticipation> = {},
): MyParticipation => ({
  id,
  status,
  decisionReason: null,
  waitlistPosition: null,
  group,
  event: ev,
  ...extra,
});

const ITEMS: MyParticipation[] = [
  row('p1', 'upcoming', 'confirmed', event('e1', 'Пробежка на Татышеве')),
  row('p2', 'upcoming', 'waitlist', event('e2', 'Футбол во дворе', { displayStatus: 'full' }), {
    waitlistPosition: 2,
  }),
  row('p3', 'upcoming', 'rejected', event('e3', 'Скалолазание'), {
    decisionReason: 'Группа набрана',
  }),
  row('p4', 'pending', 'pending', event('e4', 'Шахматы в парке')),
  row('p5', 'past', 'confirmed', event('e5', 'Зарядка', { displayStatus: 'finished' })),
  row('p6', 'past', 'confirmed', event('e6', 'Волейбол', { displayStatus: 'cancelled' })),
];

function fakeApi(items: MyParticipation[] | 'error') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      switch (`${init?.method ?? 'GET'} ${url}`) {
        case 'GET /api/me':
          return json(200, {
            id: 'u1',
            role: 'user',
            name: 'Анна',
            email: 'anna@demo',
            organization: null,
          });
        case 'GET /api/clock':
          return json(200, {
            now: '2026-10-19T12:00:00Z',
            demoMode: false,
            standId: null,
            lastResetAt: null,
          });
        case 'GET /api/me/participations':
          return items === 'error'
            ? json(500, { code: 'internal', message: 'Ошибка' })
            : json(200, { items });
        case 'GET /api/events/e4':
          return json(200, {
            id: 'e4',
            title: 'Шахматы в парке',
            description: 'Играем на поле у школы',
            sport: { id: 's1', name: 'Футбол', category: 'team', isCustom: false },
            organizer: { kind: 'user', id: 'u2', name: 'Игорь' },
            startsAt: '2026-10-25T06:00:00Z',
            endsAt: '2026-10-25T08:00:00Z',
            previousStartsAt: null,
            city: 'Красноярск',
            area: 'Центральный',
            placeText: 'Поле у школы',
            mode: 'free',
            applyQuestion: null,
            level: 'any',
            status: 'published',
            statusReason: null,
            displayStatus: 'open',
            participation: null,
            participationReason: null,
            participantInfo: null,
            actions: [],
          });
        case 'GET /api/notifications':
          return json(200, { items: [], unread: 0 });
        default:
          return json(404, { code: 'not_found', message: 'Не найдено' });
      }
    }),
  );
}

function renderAt(path: string) {
  render(
    <AppProviders client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
}

const group = (name: string) => screen.getByRole('region', { name });
const titles = (region: HTMLElement) =>
  within(region)
    .getAllByRole('link')
    .map((link) => link.querySelector('.my-participation-title')?.textContent);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('«Мои записи»', () => {
  it('группы по порядку: «Предстоящие», «Ждут решения», «Прошедшие»', async () => {
    fakeApi(ITEMS);
    renderAt('/my');
    await screen.findByRole('heading', { name: 'Предстоящие' });
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Предстоящие',
      'Ждут решения',
      'Прошедшие',
    ]);
    expect(titles(group('Предстоящие'))).toEqual([
      'Пробежка на Татышеве',
      'Футбол во дворе',
      'Скалолазание',
    ]);
    expect(titles(group('Ждут решения'))).toEqual(['Шахматы в парке']);
    expect(titles(group('Прошедшие'))).toEqual(['Зарядка', 'Волейбол']);
  });

  it('статус — текстом и пиктограммой, тон — классом; лист ожидания с позицией, отказ с причиной', async () => {
    fakeApi(ITEMS);
    renderAt('/my');
    const upcoming = await screen.findByRole('region', { name: 'Предстоящие' });
    const confirmed = within(upcoming).getByText('Вы участник').closest('.status');
    expect(confirmed?.className).toContain('status--ok');
    expect(confirmed?.querySelector('.icon')).not.toBeNull();
    expect(within(upcoming).getByText('Вы в листе ожидания, ваша позиция: 2')).toBeTruthy();
    const rejected = within(upcoming).getByText('Заявка отклонена').closest('.status');
    expect(rejected?.className).toContain('status--bad');
    expect(rejected?.textContent).toContain('Причина: Группа набрана');
    const pending = within(group('Ждут решения')).getByText('Заявка на рассмотрении');
    expect(pending.closest('.status')?.className).toContain('status--wait');
  });

  it('отменённое организатором — со статусом мероприятия; завершённое — без лишней плашки', async () => {
    fakeApi(ITEMS);
    renderAt('/my');
    const past = await screen.findByRole('region', { name: 'Прошедшие' });
    expect(within(past).getByText('Отменено организатором')).toBeTruthy();
    expect(within(past).queryByText('Завершено')).toBeNull();
  });

  it('строка ведёт в карточку мероприятия', async () => {
    fakeApi(ITEMS);
    renderAt('/my');
    const link = (await screen.findByText('Шахматы в парке')).closest('a');
    expect(link?.getAttribute('href')).toBe('/events/e4');
    await userEvent.click(link as HTMLElement);
    expect(await screen.findByRole('heading', { name: 'Шахматы в парке', level: 1 })).toBeTruthy();
  });

  it('записей нет — пустое состояние с кнопкой «Найти событие»', async () => {
    fakeApi([]);
    renderAt('/my');
    expect(await screen.findByText('Вы пока никуда не записались')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Найти событие' })?.getAttribute('href')).toBe('/');
  });

  it('сбой загрузки — сообщение, а не пустой список', async () => {
    fakeApi('error');
    renderAt('/my');
    expect((await screen.findByRole('alert')).textContent).toContain('Не удалось загрузить записи');
    expect(screen.queryByText('Вы пока никуда не записались')).toBeNull();
  });
});
