import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, AppRoutes, createQueryClient } from '../src/App';
import { DISCUSSION_REFRESH_MS } from '../src/features/discussion/api';

const anna = { id: 'u1', role: 'user', name: 'Анна', email: 'anna@demo', organization: null };

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const card = (actions: unknown[]) => ({
  id: 'e1',
  title: 'Футбол 7×7',
  description: 'Играем по средам',
  sport: { id: 's1', name: 'Футбол', category: 'team', isCustom: false },
  organizer: { kind: 'user', id: 'u2', name: 'Игорь' },
  startsAt: '2026-10-21T12:00:00.000Z',
  endsAt: '2026-10-21T13:30:00.000Z',
  previousStartsAt: null,
  city: 'Красноярск',
  area: 'Центральный',
  placeText: 'Стадион',
  mode: 'free',
  applyQuestion: null,
  level: 'any',
  status: 'published',
  statusReason: null,
  displayStatus: 'open',
  participation: null,
  participationReason: null,
  participantInfo: null,
  actions,
});

const own = [
  { code: 'edit_message', enabled: true },
  { code: 'delete_message', enabled: true },
];

type Msg = { id: string } & Record<string, unknown>;
type Thread = Msg & { replies: Msg[] };

const message = (patch: Record<string, unknown>): Msg => ({
  id: 'm1',
  parentId: null,
  author: { kind: 'user', id: 'u1', name: 'Анна' },
  isOrganizer: false,
  text: 'Можно прийти без команды?',
  placeholder: null,
  status: 'visible',
  moderationReason: null,
  createdAt: '2026-10-19T05:00:00.000Z',
  edited: false,
  actions: [],
  ...patch,
});

const thread = (): Thread[] => [
  {
    ...message({ actions: own }),
    replies: [
      message({
        id: 'm2',
        parentId: 'm1',
        author: { kind: 'organization', id: 'o1', name: 'Клуб «Енисей»' },
        isOrganizer: true,
        text: 'Да, команды делим на месте',
        edited: true,
      }),
    ],
  },
  {
    ...message({
      id: 'm3',
      author: { kind: 'user', id: 'u1', name: 'Анна' },
      text: null,
      placeholder: 'Скрыто модератором',
      status: 'hidden_by_moderator',
      moderationReason: 'Реклама',
    }),
    replies: [],
  },
  {
    ...message({
      id: 'm4',
      author: { kind: 'user', id: 'u3', name: 'Пётр' },
      text: null,
      placeholder: 'Сообщение удалено автором',
      status: 'deleted_by_author',
    }),
    replies: [],
  },
];

/** Api карточки и обсуждения в памяти: сообщения меняются, запросы записываются. */
function fakeApi({ signedIn = true } = {}) {
  let threads = thread();
  const calls: { call: string; body?: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = `${init?.method ?? 'GET'} ${url}`;
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, string>)
        : undefined;
      calls.push({ call, body });
      switch (call) {
        case 'GET /api/me':
          return signedIn
            ? json(200, anna)
            : json(401, { code: 'unauthorized', message: 'Войдите' });
        case 'GET /api/clock':
          return json(200, { now: '2026-10-19T12:00:00Z', demoMode: false, standId: null });
        case 'GET /api/events/e1':
          return json(
            200,
            card([
              signedIn
                ? { code: 'post_message', enabled: true }
                : { code: 'post_message', enabled: false, requiresAuth: true, reason: 'Войдите' },
            ]),
          );
        case 'GET /api/events/e1/messages':
          return json(200, threads);
        case 'POST /api/events/e1/messages': {
          if (!body?.text?.trim()) {
            return json(400, {
              code: 'validation_failed',
              message: 'Проверьте поля',
              fields: { text: 'Напишите сообщение' },
            });
          }
          const created = message({
            id: `m${calls.length}`,
            text: body.text,
            parentId: body.parentId ?? null,
          });
          if (body.parentId) {
            threads = threads.map((item) =>
              item.id === body.parentId ? { ...item, replies: [...item.replies, created] } : item,
            );
          } else {
            threads = [...threads, { ...created, replies: [] }];
          }
          return json(201, created);
        }
        case 'PATCH /api/events/e1/messages/m1':
          threads = threads.map((item) =>
            item.id === 'm1' ? { ...item, text: body?.text ?? '', edited: true } : item,
          );
          return json(200, threads[0]);
        case 'DELETE /api/events/e1/messages/m1':
          threads = threads.map((item) =>
            item.id === 'm1'
              ? {
                  ...item,
                  text: null,
                  placeholder: 'Сообщение удалено автором',
                  status: 'deleted_by_author',
                  actions: [],
                }
              : item,
          );
          return json(200, threads[0]);
        default:
          return json(404, { code: 'not_found', message: 'Не найдено' });
      }
    }),
  );
  return calls;
}

function renderCard() {
  return render(
    <AppProviders client={createQueryClient()}>
      <MemoryRouter initialEntries={['/events/e1']}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
}

const section = async () => within(await screen.findByRole('region', { name: 'Обсуждение' }));
const posts = (calls: { call: string; body?: unknown }[]) =>
  calls.filter(({ call }) => !call.startsWith('GET'));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('обсуждение в карточке мероприятия', () => {
  it('сообщения: автор, организация своим названием, «Организатор», «изменено», заглушки и причина автору', async () => {
    fakeApi();
    renderCard();
    const discussion = await section();
    expect(await discussion.findByText('Можно прийти без команды?')).toBeTruthy();
    const reply = discussion.getByRole('article', { name: 'Сообщение: Клуб «Енисей»' });
    expect(within(reply).getByText('Организатор')).toBeTruthy();
    expect(within(reply).getByText('изменено')).toBeTruthy();
    expect(within(reply).getByText('Да, команды делим на месте')).toBeTruthy();
    expect(discussion.getByText('Скрыто модератором. Причина: Реклама')).toBeTruthy();
    expect(discussion.getByText('Сообщение удалено автором')).toBeTruthy();
    // Ответить можно только на видимое сообщение верхнего уровня
    expect(discussion.getAllByRole('button', { name: 'Ответить' })).toHaveLength(1);
    expect(document.getElementById('discussion')).toBeTruthy();
  });

  it('вопрос: пустой — ошибка у поля; отправленный появляется, поле очищается', async () => {
    const calls = fakeApi();
    renderCard();
    const discussion = await section();
    const field = await discussion.findByLabelText('Ваш вопрос организатору и участникам');
    await userEvent.type(field, '   ');
    await userEvent.click(discussion.getByRole('button', { name: 'Отправить' }));
    expect(await discussion.findByText('Напишите сообщение')).toBeTruthy();
    expect(field.getAttribute('aria-invalid')).toBe('true');

    await userEvent.clear(field);
    await userEvent.type(field, 'Нужна своя форма?');
    await userEvent.click(discussion.getByRole('button', { name: 'Отправить' }));
    expect(await discussion.findByText('Нужна своя форма?')).toBeTruthy();
    expect(
      (discussion.getByLabelText('Ваш вопрос организатору и участникам') as HTMLTextAreaElement)
        .value,
    ).toBe('');
    expect(posts(calls).at(-1)).toEqual({
      call: 'POST /api/events/e1/messages',
      body: { text: 'Нужна своя форма?' },
    });
  });

  it('ответ на сообщение уходит с parentId и появляется под вопросом', async () => {
    const calls = fakeApi();
    renderCard();
    const discussion = await section();
    await userEvent.click(await discussion.findByRole('button', { name: 'Ответить' }));
    await userEvent.type(discussion.getByLabelText('Ответ: Анна'), 'Я тоже приду');
    await userEvent.click(discussion.getByRole('button', { name: 'Ответить' }));
    const replies = within(await discussion.findByRole('list', { name: 'Ответы: Анна' }));
    expect(await replies.findByText('Я тоже приду')).toBeTruthy();
    expect(posts(calls).at(-1)?.body).toEqual({ text: 'Я тоже приду', parentId: 'm1' });
  });

  it('своё сообщение: правка и удаление с подтверждением', async () => {
    const calls = fakeApi();
    renderCard();
    const discussion = await section();
    const mine = within(
      (await discussion.findByText('Можно прийти без команды?')).closest('article') as HTMLElement,
    );
    await userEvent.click(mine.getByRole('button', { name: 'Изменить' }));
    const field = mine.getByLabelText('Изменить сообщение');
    await userEvent.clear(field);
    await userEvent.type(field, 'Можно прийти одному?');
    await userEvent.click(mine.getByRole('button', { name: 'Сохранить' }));
    expect(await discussion.findByText('Можно прийти одному?')).toBeTruthy();
    expect(posts(calls).at(-1)).toEqual({
      call: 'PATCH /api/events/e1/messages/m1',
      body: { text: 'Можно прийти одному?' },
    });

    const edited = within(
      (await discussion.findByText('Можно прийти одному?')).closest('article') as HTMLElement,
    );
    await userEvent.click(edited.getByRole('button', { name: 'Удалить' }));
    expect(edited.getByText(/Удалить сообщение\?/)).toBeTruthy();
    await userEvent.click(edited.getByRole('button', { name: 'Удалить' }));
    await waitFor(() =>
      expect(posts(calls).at(-1)?.call).toBe('DELETE /api/events/e1/messages/m1'),
    );
    expect(await discussion.findAllByText('Сообщение удалено автором')).toHaveLength(2);
  });

  it('гость читает обсуждение, а написать — через вход с возвратом к карточке', async () => {
    fakeApi({ signedIn: false });
    renderCard();
    const discussion = await section();
    expect(await discussion.findByText('Можно прийти без команды?')).toBeTruthy();
    expect(discussion.queryByLabelText('Ваш вопрос организатору и участникам')).toBeNull();
    expect(discussion.queryByRole('button', { name: 'Ответить' })).toBeNull();
    expect(
      discussion.getByRole('link', { name: 'Войти, чтобы задать вопрос' }).getAttribute('href'),
    ).toBe('/login?next=%2Fevents%2Fe1');
  });

  it('сообщения загружаются при открытии и подгружаются каждые 30 секунд', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls = fakeApi();
    renderCard();
    await (await section()).findByText('Можно прийти без команды?');
    const loads = () => calls.filter(({ call }) => call === 'GET /api/events/e1/messages').length;
    expect(loads()).toBe(1);
    expect(DISCUSSION_REFRESH_MS).toBe(30_000);
    await vi.advanceTimersByTimeAsync(DISCUSSION_REFRESH_MS);
    await waitFor(() => expect(loads()).toBe(2));
  });
});
