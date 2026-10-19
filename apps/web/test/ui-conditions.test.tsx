import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BringList,
  FirstTimeBadge,
  HowItGoes,
  PriceBadge,
  RescheduleLeaf,
  Seats,
  WaitlistQueue,
  bringItem,
  howItGoesSteps,
} from '../src/shared/ui';

afterEach(cleanup);

const circles = (container: HTMLElement) => container.querySelectorAll('.seats-dots i');

describe('места (ТЗ 2.11, 3.2)', () => {
  it('лимит до 20 — ряд кружков, занятые залиты; подпись «Осталось 3 из 10»', () => {
    const { container } = render(<Seats capacity={10} taken={7} />);
    expect(circles(container)).toHaveLength(10);
    expect(container.querySelectorAll('.seats-dots i[data-taken]')).toHaveLength(7);
    expect(container.querySelector('.seats-dots')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('Осталось 3 из 10')).toBeTruthy();
  });

  it('больше 20 — полоса заполнения той же долей', () => {
    const { container } = render(<Seats capacity={40} taken={10} />);
    expect(circles(container)).toHaveLength(0);
    const fill = container.querySelector<HTMLElement>('.seats-bar-fill');
    expect(fill?.style.width).toBe('25%');
    expect(screen.getByText('Осталось 30 из 40')).toBeTruthy();
  });

  it('мест нет — «Мест нет» тоном очереди; занятых больше лимита не рисуем', () => {
    const { container } = render(<Seats capacity={6} taken={7} />);
    expect(container.querySelectorAll('.seats-dots i[data-taken]')).toHaveLength(6);
    const label = screen.getByText('Мест нет');
    expect(label.closest('.seats')?.classList.contains('seats--full')).toBe(true);
  });

  it('без лимита — только подпись', () => {
    const { container } = render(<Seats capacity={null} taken={12} />);
    expect(circles(container)).toHaveLength(0);
    expect(container.querySelector('.seats-bar')).toBeNull();
    expect(screen.getByText('Без ограничения мест')).toBeTruthy();
  });
});

describe('лист ожидания', () => {
  it('очередь фигурок, позиция пользователя подсвечена и подписана', () => {
    const { container } = render(<WaitlistQueue size={4} position={2} />);
    const people = container.querySelectorAll('.queue-people i');
    expect(people).toHaveLength(4);
    expect(container.querySelectorAll('.queue-people i[data-me]')).toHaveLength(1);
    expect(people[1]?.hasAttribute('data-me')).toBe(true);
    expect(screen.getByText('Вы — 2-й в листе ожидания из 4')).toBeTruthy();
  });

  it('длинная очередь не растягивает ряд: фигурок не больше 10, своя — видна', () => {
    const { container } = render(<WaitlistQueue size={25} position={17} />);
    const people = container.querySelectorAll('.queue-people i');
    expect(people.length).toBeLessThanOrEqual(10);
    expect(container.querySelectorAll('.queue-people i[data-me]')).toHaveLength(1);
    expect(screen.getByText('Вы — 17-й в листе ожидания из 25')).toBeTruthy();
  });

  it('без своей позиции — сколько человек в очереди', () => {
    const { container } = render(<WaitlistQueue size={3} />);
    expect(container.querySelectorAll('.queue-people i[data-me]')).toHaveLength(0);
    expect(screen.getByText('В листе ожидания: 3')).toBeTruthy();
  });
});

describe('бейджи условий', () => {
  it('«Можно впервые» — пиктограмма и подпись', () => {
    const { container } = render(<FirstTimeBadge />);
    expect(screen.getByText('Можно впервые')).toBeTruthy();
    expect(container.querySelector('.icon')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('стоимость: «Бесплатно» или сумма с пометкой «оплата на месте»', () => {
    render(<PriceBadge price={0} />);
    expect(screen.getByText('Бесплатно')).toBeTruthy();
    cleanup();
    render(<PriceBadge price={1500} />);
    expect(screen.getByText(/1\s500 ₽/)).toBeTruthy();
    expect(screen.getByText('оплата на месте')).toBeTruthy();
  });
});

describe('«Что взять с собой»', () => {
  it('частые предметы узнаются по слову в любой форме', () => {
    expect(bringItem('Спортивная форма')).toBe('action-uniform');
    expect(bringItem('бутылка воды')).toBe('action-water');
    expect(bringItem('Коврик для йоги')).toBe('action-mat');
    expect(bringItem('ракетку')).toBe('action-racket');
    expect(bringItem('Сменная обувь')).toBe('action-shoes');
    expect(bringItem('кроссовки')).toBe('action-shoes');
    expect(bringItem('Хорошее настроение')).toBeNull();
  });

  it('частые — пиктограммой с подписью, остальные — текстом', () => {
    const { container } = render(<BringList items={['Вода', 'Шахматные часы']} />);
    const items = within(screen.getByRole('list', { name: 'Что взять с собой' })).getAllByRole(
      'listitem',
    );
    expect(items.map((item) => item.textContent)).toEqual(['Вода', 'Шахматные часы']);
    expect(items[0]?.querySelector('.icon')).toBeTruthy();
    expect(items[1]?.querySelector('.icon')).toBeNull();
    expect(container.querySelectorAll('.icon')).toHaveLength(1);
  });

  it('пустой список не показывается', () => {
    const { container } = render(<BringList items={[]} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('«Как всё пройдёт»', () => {
  it('шаги — из строк текста организатора, без маркеров списка', () => {
    expect(
      howItGoesSteps('1. Сбор у входа в 18:50\n- Разминка 10 минут\n\nИгра\n* Чай после'),
    ).toEqual(['Сбор у входа в 18:50', 'Разминка 10 минут', 'Игра', 'Чай после']);
  });

  it('одной строкой — по предложениям; больше четырёх шагов — хвост в последнем', () => {
    expect(howItGoesSteps('Собираемся у раздевалок. Разминаемся. Бежим 5 км.')).toEqual([
      'Собираемся у раздевалок.',
      'Разминаемся.',
      'Бежим 5 км.',
    ]);
    expect(howItGoesSteps('а\nб\nв\nг\nд\nе')).toEqual(['а', 'б', 'в', 'г д е']);
  });

  it('таймлайн — нумерованный список шагов', () => {
    render(<HowItGoes text={'Сбор\nРазминка\nЗанятие\nПосле — чай'} />);
    const list = screen.getByRole('list', { name: 'Как всё пройдёт' });
    expect(list.tagName).toBe('OL');
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Сбор', 'Разминка', 'Занятие', 'После — чай']);
  });

  it('без текста — ничего', () => {
    const { container } = render(<HowItGoes text="  " />);
    expect(container.innerHTML).toBe('');
  });
});

describe('листок переноса', () => {
  it('старый листок перечёркнут и приглушён, стрелка, новый; читается «Перенесено с 21.10 на 22.10»', () => {
    const { container } = render(
      <RescheduleLeaf
        from={new Date('2026-10-21T12:00:00Z')}
        to={new Date('2026-10-22T12:00:00Z')}
      />,
    );
    const leaves = container.querySelectorAll('.date-leaf');
    expect(leaves).toHaveLength(2);
    expect(leaves[0]?.classList.contains('date-leaf-off')).toBe(true);
    expect(leaves[1]?.classList.contains('date-leaf-off')).toBe(false);
    expect(container.querySelector('.reschedule-arrow')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('Перенесено с 21.10 на 22.10')).toBeTruthy();
  });

  it('даты подписи — по Красноярску', () => {
    // 20:00 UTC 21-го — уже 22-е в Красноярске
    render(
      <RescheduleLeaf
        from={new Date('2026-10-21T20:00:00Z')}
        to={new Date('2026-10-23T20:00:00Z')}
      />,
    );
    expect(screen.getByText('Перенесено с 22.10 на 24.10')).toBeTruthy();
  });
});
