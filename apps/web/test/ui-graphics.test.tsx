import { EVENT_STATUS_VIEW, PARTICIPATION_STATUS_VIEW } from '@tandem/domain';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from '../src/shared/theme';
import {
  EmptyState,
  EventDate,
  LevelScale,
  ModeBadge,
  OrganizationStepper,
  ParticipationStepper,
  PrimaryButton,
  StatusBadge,
  leafParts,
  relativeDay,
  timeRange,
} from '../src/shared/ui';

afterEach(cleanup);

// 2026-10-19 12:00 по Красноярску (UTC+7) — понедельник
const now = new Date('2026-10-19T05:00:00Z');

describe('даты по Красноярску', () => {
  it('листок: месяц, число, день недели и полная дата для чтецов', () => {
    expect(leafParts(new Date('2026-10-21T00:30:00Z'))).toEqual({
      month: 'окт',
      day: '21',
      weekday: 'ср',
      spoken: 'Среда, 21 октября',
    });
    // 23:30 UTC 20-го — уже 21-е в Красноярске
    expect(leafParts(new Date('2026-10-20T23:30:00Z')).day).toBe('21');
  });

  it('время начала и конца', () => {
    expect(timeRange(new Date('2026-10-21T00:30:00Z'), new Date('2026-10-21T01:30:00Z'))).toBe(
      '07:30–08:30',
    );
  });

  it('относительная подпись — по календарным дням Красноярска', () => {
    expect(relativeDay(new Date('2026-10-19T13:00:00Z'), now)).toBe('сегодня');
    // 18:00 UTC 19-го — уже 20-е по Красноярску
    expect(relativeDay(new Date('2026-10-19T18:00:00Z'), now)).toBe('завтра');
    expect(relativeDay(new Date('2026-10-21T05:00:00Z'), now)).toBe('через 2 дня');
    expect(relativeDay(new Date('2026-10-24T05:00:00Z'), now)).toBe('через 5 дней');
    expect(relativeDay(new Date('2026-11-09T05:00:00Z'), now)).toBe('через 21 день');
    expect(relativeDay(new Date('2026-10-18T05:00:00Z'), now)).toBe('вчера');
    expect(relativeDay(new Date('2026-10-07T05:00:00Z'), now)).toBe('12 дней назад');
  });

  it('закончившееся событие — «прошло»', () => {
    expect(
      relativeDay(new Date('2026-10-19T01:00:00Z'), now, new Date('2026-10-19T02:00:00Z')),
    ).toBe('прошло');
  });

  it('EventDate: листок, время и подпись; в <time> — машинная дата', () => {
    const startsAt = new Date('2026-10-21T00:30:00Z');
    const { container } = render(
      <EventDate startsAt={startsAt} endsAt={new Date('2026-10-21T01:30:00Z')} now={now} />,
    );
    expect(screen.getByText('07:30–08:30')).toBeTruthy();
    expect(screen.getByText('через 2 дня')).toBeTruthy();
    const time = container.querySelector('time');
    expect(time?.getAttribute('datetime')).toBe(startsAt.toISOString());
    expect(time?.textContent).toContain('Среда, 21 октября');
    expect(container.querySelector('.leaf-day')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('шкала уровня и режим записи', () => {
  it('выбранное деление залито, подпись читается с «Уровень»', () => {
    const { container } = render(<LevelScale level="amateur" />);
    const bars = container.querySelectorAll('.level-bars i');
    expect([...bars].map((bar) => bar.hasAttribute('data-on'))).toEqual([false, true, false]);
    expect(container.querySelector('.level-bars')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText(/Любитель/).textContent).toBe('Уровень: Любитель');
  });

  it('«Любой» — залиты все три деления', () => {
    const { container } = render(<LevelScale level="any" />);
    expect(container.querySelectorAll('.level-bars i[data-on]')).toHaveLength(3);
    expect(screen.getByText(/Любой уровень/)).toBeTruthy();
  });

  it('бейдж режима — пиктограмма с подписью', () => {
    render(<ModeBadge mode="approval" />);
    expect(screen.getByText('По заявке')).toBeTruthy();
  });
});

describe('статус', () => {
  it('текст, пиктограмма (декоративная) и тон; причина — второй строкой', () => {
    const { container } = render(
      <StatusBadge view={PARTICIPATION_STATUS_VIEW.rejected} reason="Нужен опыт" />,
    );
    const status = container.querySelector('.status');
    expect(status?.className).toContain('status--bad');
    expect(status?.textContent).toBe('Заявка отклоненаПричина: Нужен опыт');
    expect(container.querySelector('.icon')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('компактный вариант — без подложки', () => {
    const { container } = render(<StatusBadge view={EVENT_STATUS_VIEW.full} compact />);
    expect(container.querySelector('.status')?.className).toContain('status-compact');
  });
});

describe('степперы', () => {
  it('заявка на рассмотрении: текущий шаг «Решение», остальные подписаны', () => {
    render(<ParticipationStepper mode="approval" status="pending" />);
    const list = screen.getByRole('list', { name: 'Ход заявки: шаг 2 из 3, решение организатора' });
    const steps = within(list).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual(['Заявка', 'Решение', 'Вы участник']);
    expect(steps[1]?.getAttribute('aria-current')).toBe('step');
  });

  it('отклонённая заявка — ошибка на шаге «Решение» с причиной', () => {
    render(<ParticipationStepper mode="approval" status="rejected" reason="Нужен опыт" />);
    const decision = screen.getByText('Нужен опыт').closest('li');
    expect(decision?.getAttribute('data-state')).toBe('error');
  });

  it('свободная запись — один шаг; лист ожидания и отмена — без степпера', () => {
    const { container, rerender } = render(<ParticipationStepper mode="free" status="confirmed" />);
    expect(container.querySelectorAll('li')).toHaveLength(1);
    rerender(<ParticipationStepper mode="approval" status="waitlist" />);
    expect(container.querySelector('ol')).toBeNull();
    rerender(<ParticipationStepper mode="free" status="cancelled" />);
    expect(container.querySelector('ol')).toBeNull();
  });

  it('путь организации: четыре шага, причина отклонения на шаге «Решение»', () => {
    render(<OrganizationStepper status="rejected" reason="Нет контактов" />);
    const list = screen.getByRole('list', { name: 'Путь организации: шаг 3 из 4' });
    const steps = within(list).getAllByRole('listitem');
    expect(steps.map((step) => step.getAttribute('data-state'))).toEqual([
      'done',
      'done',
      'error',
      'upcoming',
    ]);
    expect(steps[2]?.textContent).toContain('Нет контактов');
  });

  it('черновик — текущий шаг «Профиль»', () => {
    render(<OrganizationStepper status="draft" />);
    expect(screen.getByText('Профиль').closest('li')?.getAttribute('aria-current')).toBe('step');
  });
});

describe('главная кнопка и пустое состояние', () => {
  it('недоступная кнопка объясняет причину рядом', () => {
    render(
      <PrimaryButton reason="Мест нет: увеличьте лимит или дождитесь отмены">
        Принять
      </PrimaryButton>,
    );
    const button = screen.getByRole('button', { name: 'Принять' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.getAttribute('aria-describedby')).toBeTruthy();
    const reason = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toBe('Мест нет: увеличьте лимит или дождитесь отмены');
  });

  it('пустое состояние: декоративная иллюстрация, строка и одна кнопка', () => {
    const { container } = render(
      <ThemeProvider>
        <MemoryRouter>
          <EmptyState
            text="Ничего не нашлось"
            action={{ label: 'Создать своё событие', to: '/create' }}
          />
        </MemoryRouter>
      </ThemeProvider>,
    );
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(screen.getByText('Ничего не нашлось')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Создать своё событие' }).getAttribute('href')).toBe(
      '/create',
    );
  });
});
