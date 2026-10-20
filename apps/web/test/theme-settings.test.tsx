import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, AppRoutes, createQueryClient } from '../src/App';
import { savedTheme } from '../src/features/auth';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const anna = (settings: unknown = {}) => ({
  id: 'u1',
  role: 'user',
  name: 'Анна',
  email: 'anna@demo',
  city: null,
  bio: null,
  settings,
  organization: null,
});

/** Api в памяти: профиль, вход и сохранение настроек оформления. */
function fakeApi({ signedIn = false, settings = {} as unknown, saveFails = false } = {}) {
  let me: ReturnType<typeof anna> | null = signedIn ? anna(settings) : null;
  const saved: unknown[] = [];
  /** `nextLogin` — кем войдёт следующий; `hold` — ответ на PATCH ждёт, пока его не отпустят. */
  const failures = {
    saveFails,
    nextLogin: 'u1',
    hold: null as null | ((respond: (fail: boolean) => void) => void),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const call = `${init?.method ?? 'GET'} ${new URL(url, 'http://stand').pathname}`;
      switch (call) {
        case 'GET /api/me':
          return me ? json(200, me) : json(401, { code: 'unauthorized', message: 'Войдите' });
        case 'GET /api/clock':
          return json(200, {
            now: '2026-10-19T12:00:00Z',
            demoMode: false,
            standId: null,
            lastResetAt: null,
          });
        case 'POST /api/auth/login':
          me = { ...anna(settings), id: failures.nextLogin, name: 'Вошедший' };
          return json(200, me);
        case 'POST /api/auth/logout':
          me = null;
          return json(204);
        case 'PATCH /api/me/settings': {
          const patch = JSON.parse(String(init?.body)) as object;
          saved.push(patch);
          const answer = (fail: boolean) =>
            fail
              ? json(500, { code: 'internal', message: 'Ошибка' })
              : json(200, anna({ theme: patch }));
          const hold = failures.hold;
          if (hold) {
            failures.hold = null;
            return new Promise<Response>((resolve) => hold((fail) => resolve(answer(fail))));
          }
          return answer(failures.saveFails);
        }
        case 'GET /api/events':
          return json(200, { items: [], total: 0, limit: 20, offset: 0 });
        default:
          return json(404, { code: 'not_found', message: 'Не найдено' });
      }
    }),
  );
  return { saved, failures };
}

function renderApp(path: string) {
  return render(
    <AppProviders client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
}

const root = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  delete root().dataset.theme;
  delete root().dataset.text;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('оформление, сохранённое в аккаунте', () => {
  it('читает только известные настройки и только да/нет', () => {
    expect(savedTheme({ theme: { largeText: true, contrast: false } })).toEqual({
      largeText: true,
      contrast: false,
    });
    expect(savedTheme({ theme: { largeText: 'да', contrast: true, extra: 1 } })).toEqual({
      contrast: true,
    });
    expect(savedTheme(null)).toEqual({});
    expect(savedTheme({ theme: [] })).toEqual({});
    expect(savedTheme('строка')).toEqual({});
  });
});

describe('переключатели «Крупный текст» и «Высокий контраст»', { timeout: 15_000 }, () => {
  it('у вошедшего выбор в шапке сохраняется в аккаунт', async () => {
    const { saved } = fakeApi({ signedIn: true });
    const user = userEvent.setup();
    renderApp('/');

    await screen.findByRole('button', { name: 'Сменить аккаунт' });
    await user.click(screen.getByRole('button', { name: /Крупный текст/ }));
    expect(root().dataset.text).toBe('large');
    await waitFor(() => expect(saved).toEqual([{ largeText: true }]));
    expect(JSON.parse(localStorage.getItem('tandem-theme') ?? '{}')).toMatchObject({
      largeText: true,
    });
  });

  it('у гостя выбор остаётся в браузере, в аккаунт ничего не уходит', async () => {
    const { saved } = fakeApi();
    const user = userEvent.setup();
    renderApp('/');

    await user.click(await screen.findByRole('button', { name: /Контраст/ }));
    expect(root().dataset.theme).toBe('contrast');
    expect(JSON.parse(localStorage.getItem('tandem-theme') ?? '{}')).toMatchObject({
      contrast: true,
    });
    expect(saved).toEqual([]);
  });

  it('после входа применяется оформление из аккаунта', async () => {
    fakeApi({ settings: { theme: { contrast: true } } });
    const user = userEvent.setup();
    renderApp('/login');

    expect(root().dataset.theme).toBe('default');
    await user.type(await screen.findByLabelText('Почта'), 'anna@demo');
    await user.type(screen.getByLabelText('Пароль'), 'demo');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    await waitFor(() => expect(root().dataset.theme).toBe('contrast'));
    // «Крупный текст» в аккаунте не задан — остаётся выбор браузера
    expect(root().dataset.text).toBe('normal');
  });

  it('своё сохранение не откатывает выбор: переключить можно и обратно', async () => {
    const { saved } = fakeApi({ signedIn: true, settings: { theme: { largeText: true } } });
    const user = userEvent.setup();
    renderApp('/');

    await waitFor(() => expect(root().dataset.text).toBe('large'));
    await user.click(screen.getByRole('button', { name: /Крупный текст/ }));
    await waitFor(() => expect(saved).toEqual([{ largeText: false }]));
    expect(root().dataset.text).toBe('normal');
  });

  it('в профиле — «Оформление» с теми же переключателями', async () => {
    const { saved } = fakeApi({ signedIn: true });
    const user = userEvent.setup();
    renderApp('/profile');

    const section = await screen.findByRole('region', { name: 'Оформление' });
    const contrast = section.querySelector('button:nth-of-type(2)') as HTMLButtonElement;
    expect(contrast.textContent).toBe('Высокий контраст');
    expect(contrast.getAttribute('aria-pressed')).toBe('false');
    await user.click(contrast);
    expect(contrast.getAttribute('aria-pressed')).toBe('true');
    expect(root().dataset.theme).toBe('contrast');
    // Шапка показывает то же состояние
    expect(screen.getByRole('button', { name: /^Контраст$/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    await waitFor(() => expect(saved).toEqual([{ contrast: true }]));
  });

  it('сбой сохранения в аккаунт не откатывает выбор', async () => {
    const { saved } = fakeApi({
      signedIn: true,
      settings: { theme: { largeText: true } },
      saveFails: true,
    });
    const user = userEvent.setup();
    renderApp('/');

    await waitFor(() => expect(root().dataset.text).toBe('large'));
    await user.click(screen.getByRole('button', { name: /Крупный текст/ }));
    await waitFor(() => expect(saved).toEqual([{ largeText: false }]));
    // Ответ с ошибкой пришёл, а оформление из аккаунта повторно не применилось
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(root().dataset.text).toBe('normal');
    expect(JSON.parse(localStorage.getItem('tandem-theme') ?? '{}')).toMatchObject({
      largeText: false,
    });
    // Но человек знает, что в аккаунт не сохранилось
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Не сохранилось в аккаунте — выбор остался в этом браузере',
    );
  });

  it('в профиле сбой — у «Оформления», один раз; удачное сохранение убирает сообщение', async () => {
    const { failures } = fakeApi({ signedIn: true, saveFails: true });
    const user = userEvent.setup();
    renderApp('/profile');

    const section = await screen.findByRole('region', { name: 'Оформление' });
    const contrast = section.querySelector('button:nth-of-type(2)') as HTMLButtonElement;
    await user.click(contrast);
    const alert = await screen.findByRole('alert');
    expect(section.contains(alert)).toBe(true);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(section.textContent).not.toContain('работает на любом устройстве');

    failures.saveFails = false;
    await user.click(contrast);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(section.textContent).toContain('Выбор запоминается в аккаунте');
  });

  it('сообщение в шапке — в потоке страницы, а не в прилипающей части', async () => {
    fakeApi({ signedIn: true, saveFails: true });
    const user = userEvent.setup();
    renderApp('/');
    await screen.findByRole('button', { name: 'Сменить аккаунт' });
    await user.click(screen.getByRole('button', { name: /Крупный текст/ }));
    const alert = await screen.findByRole('alert');
    expect(alert.closest('.app-top')).toBeNull();
    expect(alert.closest('main')).not.toBeNull();
  });

  it('в профиле сообщение — под кнопками: нажатая кнопка не сдвигается', async () => {
    fakeApi({ signedIn: true, saveFails: true });
    const user = userEvent.setup();
    renderApp('/profile');
    const section = await screen.findByRole('region', { name: 'Оформление' });
    const button = section.querySelector('button') as HTMLButtonElement;
    await user.click(button);
    const alert = await screen.findByRole('alert');
    expect(alert.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('после выхода сбой прежнего аккаунта не показывается', async () => {
    fakeApi({ signedIn: true, saveFails: true });
    const user = userEvent.setup();
    renderApp('/');
    await screen.findByRole('button', { name: 'Сменить аккаунт' });
    await user.click(screen.getByRole('button', { name: /Крупный текст/ }));
    expect(await screen.findByRole('alert')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Сменить аккаунт' }));
    await screen.findByRole('heading', { name: 'Вход' });
    expect(screen.queryByText(/Не сохранилось в аккаунте/)).toBeNull();
  });

  it('после сбоя следующее сохранение отправляет обе настройки', async () => {
    const { saved, failures } = fakeApi({ signedIn: true, saveFails: true });
    const user = userEvent.setup();
    renderApp('/');
    await screen.findByRole('button', { name: 'Сменить аккаунт' });
    await user.click(screen.getByRole('button', { name: /Крупный текст/ }));
    await screen.findByRole('alert');

    failures.saveFails = false;
    await user.click(screen.getByRole('button', { name: /Контраст/ }));
    await waitFor(() => expect(saved).toHaveLength(2));
    // Крупный текст не сохранился в первый раз — уходит вместе с контрастом
    expect(saved[1]).toEqual({ largeText: true, contrast: true });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('после выхода и входа другим аккаунтом сбой прежнего не показывается', async () => {
    const { failures } = fakeApi({ signedIn: true, saveFails: true });
    const user = userEvent.setup();
    renderApp('/');
    await screen.findByRole('button', { name: 'Сменить аккаунт' });
    await user.click(screen.getByRole('button', { name: /Крупный текст/ }));
    expect(await screen.findByRole('alert')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Сменить аккаунт' }));
    failures.nextLogin = 'u2';
    await user.type(await screen.findByLabelText('Почта'), 'igor@demo');
    await user.type(screen.getByLabelText('Пароль'), 'demo');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    await screen.findByRole('button', { name: 'Сменить аккаунт' });
    expect(screen.queryByText(/Не сохранилось в аккаунте/)).toBeNull();
  });

  it('сбой первого из двух сохранений после успеха второго — сообщение остаётся', async () => {
    const { failures } = fakeApi({ signedIn: true });
    const user = userEvent.setup();
    renderApp('/');
    await screen.findByRole('button', { name: 'Сменить аккаунт' });
    let respondFirst: (fail: boolean) => void = () => undefined;
    failures.hold = (respond) => {
      respondFirst = respond;
    };
    await user.click(screen.getByRole('button', { name: /Крупный текст/ }));
    await user.click(screen.getByRole('button', { name: /Контраст/ }));
    await waitFor(() => expect(root().dataset.theme).toBe('contrast'));
    respondFirst(true);
    // «Крупный текст» так и не сохранился, хотя последнее сохранение удалось
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Не сохранилось в аккаунте — выбор остался в этом браузере',
    );
  });

  it('в профиле сбой прокручивается в видимую область', async () => {
    const original = Element.prototype.scrollIntoView;
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    try {
      fakeApi({ signedIn: true, saveFails: true });
      const user = userEvent.setup();
      renderApp('/profile');
      const section = await screen.findByRole('region', { name: 'Оформление' });
      await user.click(section.querySelector('button') as HTMLButtonElement);
      const alert = await screen.findByRole('alert');
      await waitFor(() => expect(scrolled).toHaveBeenCalled());
      expect(scrolled.mock.contexts.at(-1)).toBe(alert);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('после выхода и входа тем же аккаунтом прежний сбой не показывается', async () => {
    fakeApi({ signedIn: true, saveFails: true });
    const user = userEvent.setup();
    renderApp('/');
    await screen.findByRole('button', { name: 'Сменить аккаунт' });
    await user.click(screen.getByRole('button', { name: /Крупный текст/ }));
    expect(await screen.findByRole('alert')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Сменить аккаунт' }));
    await user.type(await screen.findByLabelText('Почта'), 'anna@demo');
    await user.type(screen.getByLabelText('Пароль'), 'demo');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    await screen.findByRole('button', { name: 'Сменить аккаунт' });
    expect(screen.queryByText(/Не сохранилось в аккаунте/)).toBeNull();
  });

  it('сбой помнится и через 5 минут, когда переключатели уже на другой странице', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fakeApi({ signedIn: true, saveFails: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderApp('/profile');
      const section = await screen.findByRole('region', { name: 'Оформление' });
      await user.click(section.querySelector('button') as HTMLButtonElement);
      await screen.findByRole('alert');

      // Уход из профиля: мутация «Оформления» осталась без подписчика
      await user.click(screen.getByRole('link', { name: 'Найти' }));
      await vi.advanceTimersByTimeAsync(6 * 60_000);
      expect((await screen.findByRole('alert')).textContent).toBe(
        'Не сохранилось в аккаунте — выбор остался в этом браузере',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('опоздавший ответ прежнего аккаунта не возвращает его в шапку', async () => {
    const { failures } = fakeApi({ signedIn: true });
    const user = userEvent.setup();
    renderApp('/');
    await screen.findByRole('button', { name: 'Сменить аккаунт' });
    let respond: (fail: boolean) => void = () => undefined;
    failures.hold = (answer) => {
      respond = answer;
    };
    await user.click(screen.getByRole('button', { name: /Контраст/ }));
    await user.click(screen.getByRole('button', { name: 'Сменить аккаунт' }));
    failures.nextLogin = 'u2';
    await user.type(await screen.findByLabelText('Почта'), 'igor@demo');
    await user.type(screen.getByLabelText('Пароль'), 'demo');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByText('Вошедший')).toBeTruthy();

    respond(false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByText('Вошедший')).toBeTruthy();
    expect(screen.queryByText('Анна')).toBeNull();
  });

  it('опоздавший ответ после выхода не возвращает вошедшего', async () => {
    const { failures } = fakeApi({ signedIn: true });
    const user = userEvent.setup();
    renderApp('/');
    await screen.findByRole('button', { name: 'Сменить аккаунт' });
    let respond: (fail: boolean) => void = () => undefined;
    failures.hold = (answer) => {
      respond = answer;
    };
    await user.click(screen.getByRole('button', { name: /Контраст/ }));
    await user.click(screen.getByRole('button', { name: 'Сменить аккаунт' }));
    await screen.findByRole('heading', { name: 'Вход' });

    respond(false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole('heading', { name: 'Вход' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Сменить аккаунт' })).toBeNull();
  });

  it('после сбоя вместе с новым выбором уходит только несохранённое', async () => {
    const { saved, failures } = fakeApi({ signedIn: true, saveFails: true });
    const user = userEvent.setup();
    renderApp('/');
    await screen.findByRole('button', { name: 'Сменить аккаунт' });
    await user.click(screen.getByRole('button', { name: /Контраст/ }));
    await screen.findByRole('alert');

    failures.saveFails = false;
    await user.click(screen.getByRole('button', { name: /Контраст/ }));
    await waitFor(() => expect(saved).toHaveLength(2));
    // «Крупный текст» не сбоил — его значение из этой вкладки не отправляется
    expect(saved[1]).toEqual({ contrast: false });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
