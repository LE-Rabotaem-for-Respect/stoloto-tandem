import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';

describe('App', () => {
  it('показывает заглушку и время по Красноярску', () => {
    render(<App now={new Date('2026-10-19T00:00:00Z')} />);
    expect(screen.getByRole('heading', { name: 'Столото: спорт вместе' })).toBeTruthy();
    expect(screen.getByText('Сейчас в Красноярске 07:00')).toBeTruthy();
  });
});
