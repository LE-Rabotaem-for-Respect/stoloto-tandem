import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, AppRoutes, createQueryClient } from '../src/App';
import {
  emptyState,
  stateFromCard,
  stepErrors,
  toUpdateBody,
} from '../src/features/events/create/form-state';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const igor = { id: 'u1', role: 'user', name: 'Игорь', email: 'igor@demo', organization: null };

const card = (patch: Record<string, unknown> = {}) => ({
  id: 'e1',
  title: 'Футбол 7×7 по средам',
  description: 'Играем 7 на 7',
  sport: { id: 's1', name: 'Футбол', category: 'team', isCustom: false },
  organizer: { kind: 'user', id: 'u1', name: 'Игорь' },
  startsAt: '2026-10-25T12:00:00.000Z',
  endsAt: '2026-10-25T13:30:00.000Z',
  previousStartsAt: null,
  city: 'Красноярск',
  area: 'Центральный',
  placeText: 'Поле у школы',
  mode: 'approval',
  applyQuestion: 'Ваш опыт?',
  level: 'amateur',
  status: 'published',
  statusReason: null,
  displayStatus: 'open',
  participation: null,
  participationReason: null,
  participantInfo: 'Раздевалка с 18:30',
  actions: [{ code: 'edit_event', enabled: true }],
  ...patch,
});

/** Api в памяти: вошедший организатор, карточка и её изменение. */
function fakeApi(
  cardBody: Record<string, unknown> = card(),
  patchResponse: () => Response = () => json(200, card()),
) {
  const patches: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = `${init?.method ?? 'GET'} ${url}`;
      if (call === 'GET /api/me') return json(200, igor);
      if (call === 'GET /api/clock') {
        return json(200, { now: '2026-10-19T12:00:00Z', demoMode: false, standId: null });
      }
      if (call === 'GET /api/events/e1') return json(200, cardBody);
      if (call === 'PATCH /api/events/e1') {
        patches.push(JSON.parse(String(init?.body)));
        return patchResponse();
      }
      return json(404, { code: 'not_found', message: 'Не найдено' });
    }),
  );
  return { patches };
}

function renderEdit() {
  return render(
    <AppProviders client={createQueryClient()}>
      <MemoryRouter initialEntries={['/events/e1/edit']}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('поля формы изменения', () => {
  it('из карточки: дата и время — по Красноярску, пустые поля — пустой строкой', () => {
    const state = stateFromCard({ ...card(), participantInfo: null, applyQuestion: null } as never);
    expect(state).toMatchObject({
      date: '2026-10-25',
      startTime: '19:00',
      endTime: '20:30',
      sport: { kind: 'existing', id: 's1', name: 'Футбол' },
      participantInfo: '',
      applyQuestion: '',
    });
  });

  it('тело PATCH — только изменяемые поля; вопрос — только у «По заявке»', () => {
    const state = stateFromCard(card() as never);
    const body = toUpdateBody({ ...state, title: '  Футбол по четвергам ' });
    expect(body).toEqual({
      title: 'Футбол по четвергам',
      description: 'Играем 7 на 7',
      city: 'Красноярск',
      area: 'Центральный',
      placeText: 'Поле у школы',
      participantInfo: 'Раздевалка с 18:30',
      level: 'amateur',
      mode: 'approval',
      applyQuestion: 'Ваш опыт?',
    });
    expect(toUpdateBody({ ...state, mode: 'free' }).applyQuestion).toBeNull();
  });

  it('при изменении дата и время не проверяются — их меняет перенос', () => {
    const past = { ...emptyState(), date: '2026-10-01', startTime: '10:00', endTime: '09:00' };
    const now = new Date('2026-10-19T12:00:00Z');
    expect(stepErrors(1, past, now).startTime).toBeDefined();
    const edit = stepErrors(1, { ...past, area: 'Центр', placeText: 'Поле' }, now, {
      schedule: false,
    });
    expect(edit).toEqual({});
  });
});

describe('экран «Изменить»', { timeout: 15_000 }, () => {
  it('те же шаги, поля из карточки; направление и дата — с причиной; «Сохранить» ведёт в карточку', async () => {
    const { patches } = fakeApi();
    const user = userEvent.setup();
    renderEdit();

    const title = (await screen.findByLabelText('Название')) as HTMLInputElement;
    expect(title.value).toBe('Футбол 7×7 по средам');
    const sport = screen.getByLabelText('Направление') as HTMLInputElement;
    expect(sport.value).toBe('Футбол');
    expect(sport.readOnly).toBe(true);
    screen.getByText('Направление после публикации не меняется');

    await user.clear(title);
    await user.type(title, 'Футбол по четвергам');
    await user.click(screen.getByRole('button', { name: 'Далее' }));
    const schedule = (await screen.findByLabelText('Дата и время')) as HTMLInputElement;
    expect(schedule.value).toBe('25.10.2026, 19:00–20:30');
    screen.getByText('Дату и время меняют через «Перенести»');
    await user.click(screen.getByRole('button', { name: 'Далее' }));
    await user.click(await screen.findByRole('button', { name: 'Далее' }));
    await user.click(await screen.findByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toMatchObject({ title: 'Футбол по четвергам', mode: 'approval' });
    expect(patches[0]).not.toHaveProperty('startsAt');
    expect(patches[0]).not.toHaveProperty('sportId');
    await screen.findByRole('heading', { name: 'Футбол 7×7 по средам', level: 1 });
  });

  it('отказ сервера по режиму — у поля на шаге «Запись»', async () => {
    fakeApi(card(), () =>
      json(400, {
        code: 'validation_failed',
        message: 'Проверьте поля формы',
        fields: { mode: 'Режим записи не меняется, пока есть заявки, участники или лист ожидания' },
      }),
    );
    const user = userEvent.setup();
    renderEdit();
    await screen.findByLabelText('Название');
    for (let i = 0; i < 3; i += 1) {
      await user.click(screen.getByRole('button', { name: 'Далее' }));
    }
    await user.click(await screen.findByRole('radio', { name: /Свободно/ }));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await screen.findByText(
      'Режим записи не меняется, пока есть заявки, участники или лист ожидания',
    );
    screen.getByRole('heading', { name: /Шаг 4 из 4/ });
  });

  it('недоступно — причина из api, формы нет', async () => {
    fakeApi(
      card({
        actions: [
          {
            code: 'edit_event',
            enabled: false,
            reason: 'Мероприятие уже началось: изменить его нельзя',
          },
        ],
      }),
    );
    renderEdit();
    await screen.findByText('Мероприятие уже началось: изменить его нельзя');
    expect(screen.queryByLabelText('Название')).toBeNull();
    expect(screen.getByRole('link', { name: 'Вернуться к карточке' }).getAttribute('href')).toBe(
      '/events/e1',
    );
  });

  it('не организатору — формы нет', async () => {
    fakeApi(card({ actions: [{ code: 'join', enabled: true }] }));
    renderEdit();
    await screen.findByText('Изменить мероприятие может только его организатор');
    expect(screen.queryByLabelText('Название')).toBeNull();
  });
});
