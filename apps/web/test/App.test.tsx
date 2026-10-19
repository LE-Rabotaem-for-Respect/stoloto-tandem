import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';

describe('App', () => {
  it('показывает заглушку и часовой пояс из domain', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Столото: спорт вместе' })).toBeTruthy();
    expect(
      screen.getByText('Даты и время мероприятий указаны по часовому поясу Asia/Krasnoyarsk.'),
    ).toBeTruthy();
  });
});
