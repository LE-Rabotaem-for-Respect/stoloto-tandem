import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClock } from '../src/shared/clock';
import { relativeDay } from '../src/shared/ui';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

// Часы браузера: понедельник, 19 октября, 10:00 по Красноярску
const BROWSER_NOW = new Date('2026-10-19T03:00:00Z');
// Начало мероприятия: среда, 21 октября, 19:00 по Красноярску
const EVENT_START = new Date('2026-10-21T12:00:00Z');

function Probe() {
  const now = useClock();
  return (
    <p>
      <span data-testid="now">{now.toISOString()}</span>
      <span data-testid="label">{relativeDay(EVENT_START, now)}</span>
    </p>
  );
}

function renderProbe() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // Только Date: таймеры TanStack Query и testing-library идут как обычно
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BROWSER_NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useClock — «сейчас» сервера', () => {
  it('до ответа /clock — часы браузера', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderProbe();
    expect(screen.getByTestId('now').textContent).toBe(BROWSER_NOW.toISOString());
    expect(screen.getByTestId('label').textContent).toBe('через 2 дня');
  });

  it('демо-часы сервера перемотаны на 2 дня — «сейчас» и подпись идут за ними', async () => {
    const serverNow = new Date(BROWSER_NOW.getTime() + 2 * 24 * 60 * 60 * 1000);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          now: serverNow.toISOString(),
          demoMode: true,
          standId: 'stand-1',
          lastResetAt: null,
        }),
      ),
    );
    renderProbe();
    await waitFor(() =>
      expect(screen.getByTestId('now').textContent).toBe(serverNow.toISOString()),
    );
    expect(screen.getByTestId('label').textContent).toBe('сегодня');
  });
});
