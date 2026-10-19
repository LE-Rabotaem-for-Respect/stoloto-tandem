import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Action } from '@tandem/domain';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, AppRoutes, createQueryClient } from '../src/App';
import {
  actionLabel,
  isOrganizerView,
  primaryAction,
  secondaryActions,
} from '../src/features/event-card/actions';

const anna = { id: 'u1', role: 'user', name: 'Анна', email: 'anna@demo', organization: null };

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const card = (patch: Record<string, unknown> = {}) => ({
  id: 'e1',
  title: 'Пробежка 5 км на Татышеве',
  description: 'Бежим в спокойном темпе.\nПосле — чай.',
  sport: { id: 's1', name: 'Бег', category: 'endurance', isCustom: false },
  organizer: { kind: 'organization', id: 'o1', name: 'Беговой клуб «Енисей»' },
  startsAt: '2026-10-21T00:30:00.000Z',
  endsAt: '2026-10-21T01:30:00.000Z',
  previousStartsAt: null,
  city: 'Красноярск',
  area: 'Остров Татышев',
  placeText: 'Вход у моста',
  mode: 'free',
  applyQuestion: null,
  level: 'amateur',
  status: 'published',
  statusReason: null,
  displayStatus: 'open',
  participation: null,
  participantInfo: null,
  actions: [{ code: 'join', enabled: true }],
  ...patch,
});

const guestJoin: Action = {
  code: 'join',
  enabled: false,
  requiresAuth: true,
  reason: 'Войдите, чтобы записаться',
};

interface FakeOptions {
  signedIn?: boolean;
  /** Карточка для вошедшего и для гостя. */
  cardFor?: (signedIn: boolean) => Response;
}

function fakeApi({ signedIn = false, cardFor }: FakeOptions = {}) {
  let me = signedIn;
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = `${init?.method ?? 'GET'} ${url}`;
      calls.push(call);
      switch (call) {
        case 'GET /api/me':
          return me ? json(200, anna) : json(401, { code: 'unauthorized', message: 'Войдите' });
        case 'GET /api/clock':
          return json(200, {
            now: '2026-10-19T12:00:00Z',
            demoMode: false,
            standId: null,
            lastResetAt: null,
          });
        case 'POST /api/auth/login':
          me = true;
          return json(200, anna);
        case 'GET /api/events/e1':
          return cardFor ? cardFor(me) : json(200, me ? card() : card({ actions: [guestJoin] }));
        case 'POST /api/events/e1/join':
          return json(201, { status: 'confirmed' });
        default:
          return json(404, { code: 'not_found', message: 'Не найдено' });
      }
    }),
  );
  return { calls };
}

function renderCard(path = '/events/e1') {
  return render(
    <AppProviders client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('действия карточки по actions[]', () => {
  const join: Action = { code: 'join', enabled: true };
  const leave: Action = { code: 'leave', enabled: true };
  const message: Action = { code: 'post_message', enabled: false, reason: 'Только участникам' };
  const cancel: Action = { code: 'cancel_event', enabled: true };

  it('главная кнопка — запись или отмена записи, остальное — прочие действия', () => {
    expect(primaryAction([message, join])).toBe(join);
    expect(primaryAction([message, leave])).toBe(leave);
    expect(primaryAction([message, cancel])).toBeUndefined();
    expect(secondaryActions([join, message, cancel])).toEqual([message, cancel]);
  });

  it('организатора видно по действиям управления', () => {
    expect(isOrganizerView([join, message])).toBe(false);
    expect(isOrganizerView([message, cancel])).toBe(true);
    expect(isOrganizerView([{ code: 'reschedule_event', enabled: false, reason: 'x' }])).toBe(true);
  });

  it('подпись записи — по режиму', () => {
    expect(actionLabel('join', 'free')).toBe('Записаться');
    expect(actionLabel('join', 'approval')).toBe('Подать заявку');
    expect(actionLabel('leave', 'free')).toBe('Отменить запись');
  });
});

describe('карточка мероприятия', { timeout: 15_000 }, () => {
  it('первый экран: обложка, название, дата, место, уровень, статус и одна главная кнопка', async () => {
    fakeApi({ signedIn: true });
    renderCard();

    const article = await screen.findByRole('article', { name: 'Пробежка 5 км на Татышеве' });
    const inCard = within(article);
    expect(inCard.getByRole('img', { name: 'Выносливость' })).toBeTruthy();
    inCard.getByText('Бег');
    inCard.getByText('07:30–08:30');
    inCard.getByText('Любитель');
    inCard.getByText('Красноярск, Остров Татышев, Вход у моста');
    inCard.getByText('Набор открыт');
    inCard.getByText('Свободно');
    expect(inCard.getAllByRole('button')).toHaveLength(1);
    inCard.getByRole('button', { name: 'Записаться' });
    expect(inCard.getByRole('link', { name: 'Беговой клуб «Енисей»' }).getAttribute('href')).toBe(
      '/organizations/o1',
    );

    // «Об активности» и «Условия» свёрнуты, места под вопросы и обсуждение есть
    const about = inCard.getByText('Об активности').closest('details');
    expect(about?.open).toBe(false);
    expect(about?.textContent).toContain('Бежим в спокойном темпе.');
    expect(inCard.getByText('Условия').closest('details')?.open).toBe(false);
    inCard.getByRole('heading', { name: 'Частые вопросы' });
    inCard.getByRole('heading', { name: 'Обсуждение' });
  });

  it('гость: кнопка ведёт на вход, после входа запись выполняется сама', async () => {
    const { calls } = fakeApi();
    const user = userEvent.setup();
    renderCard();

    await screen.findByText('Войдите, чтобы записаться');
    await user.click(screen.getByRole('button', { name: 'Записаться' }));
    expect(calls).not.toContain('POST /api/events/e1/join');

    await user.type(await screen.findByLabelText('Почта'), 'anna@demo');
    await user.type(screen.getByLabelText('Пароль'), 'demo');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    await screen.findByRole('article', { name: 'Пробежка 5 км на Татышеве' });
    await waitFor(() => expect(calls).toContain('POST /api/events/e1/join'));
    expect(calls.filter((call) => call === 'POST /api/events/e1/join')).toHaveLength(1);
    // После записи карточка перечитана
    await waitFor(() =>
      expect(calls.lastIndexOf('GET /api/events/e1')).toBeGreaterThan(
        calls.indexOf('POST /api/events/e1/join'),
      ),
    );
  });

  it('недоступная запись — причина рядом с кнопкой; статус записи и информация участникам', async () => {
    fakeApi({
      cardFor: () =>
        json(
          200,
          card({
            mode: 'approval',
            applyQuestion: 'Сколько бегаете?',
            participation: 'confirmed',
            participantInfo: 'Сбор у входа в 7:20',
            actions: [{ code: 'join', enabled: false, reason: 'Вы уже участник' }],
          }),
        ),
    });
    const user = userEvent.setup();
    renderCard();

    const button = await screen.findByRole('button', { name: 'Подать заявку' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    screen.getByText('Вы уже участник');
    screen.getByText('Вы участник');

    await user.click(screen.getByText('Условия'));
    screen.getByText('Сколько бегаете?');
    screen.getByRole('heading', { name: 'Информация для участников' });
    screen.getByText('Сбор у входа в 7:20');
  });

  it('отменённое мероприятие — статус с причиной', async () => {
    fakeApi({
      cardFor: () =>
        json(
          200,
          card({
            status: 'cancelled',
            displayStatus: 'cancelled',
            statusReason: 'Гроза',
            actions: [{ code: 'join', enabled: false, reason: 'Мероприятие отменено' }],
          }),
        ),
    });
    renderCard();
    await screen.findByText('Отменено организатором');
    screen.getByText('Причина: Гроза');
  });

  it('организатор: «Изменить», вкладка «Участники и заявки», прочие действия по actions[]', async () => {
    fakeApi({
      cardFor: () =>
        json(
          200,
          card({
            actions: [
              { code: 'join', enabled: false, reason: 'Организатор не записывается' },
              { code: 'post_message', enabled: true },
              { code: 'reschedule_event', enabled: true },
              { code: 'cancel_event', enabled: false, reason: 'Мероприятие уже идёт' },
            ],
          }),
        ),
    });
    const user = userEvent.setup();
    renderCard();

    const edit = await screen.findByRole('link', { name: 'Изменить' });
    expect(edit.getAttribute('href')).toBe('/events/e1/edit');
    expect(screen.getByRole('link', { name: 'Перенести' }).getAttribute('href')).toBe(
      '/events/e1/edit',
    );
    expect(screen.getByRole('link', { name: 'Написать в обсуждение' }).getAttribute('href')).toBe(
      '#discussion',
    );
    screen.getByText('Отменить мероприятие: Мероприятие уже идёт');

    const cardTab = screen.getByRole('tab', { name: 'Карточка' });
    expect(cardTab.getAttribute('aria-selected')).toBe('true');
    cardTab.focus();
    await user.keyboard('{ArrowRight}');
    const participants = screen.getByRole('tab', { name: 'Участники и заявки' });
    expect(participants.getAttribute('aria-selected')).toBe('true');
    expect(participants).toBe(document.activeElement);
    screen.getByText('Здесь будут участники и заявки на это мероприятие.');
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('участнику вкладок организатора нет', async () => {
    fakeApi({ signedIn: true });
    renderCard();
    await screen.findByRole('article', { name: 'Пробежка 5 км на Татышеве' });
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Изменить' })).toBeNull();
  });

  it('недоступное мероприятие — понятный текст и путь к ленте', async () => {
    fakeApi({
      cardFor: () => json(404, { code: 'event_not_available', message: 'Мероприятие недоступно' }),
    });
    renderCard();
    await screen.findByText('Мероприятие недоступно');
    expect(screen.getByRole('link', { name: 'Найти другое занятие' }).getAttribute('href')).toBe(
      '/',
    );
  });
});
