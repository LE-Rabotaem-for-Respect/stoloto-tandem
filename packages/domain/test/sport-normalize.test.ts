import { describe, expect, it } from 'vitest';
import { normalizeSportName } from '../src';

describe('normalizeSportName', () => {
  it('обрезает пробелы по краям', () => {
    expect(normalizeSportName('  падел ')).toBe('падел');
  });

  it('схлопывает повторные пробелы, табуляции и переводы строк', () => {
    expect(normalizeSportName('настольный   \t теннис\nв парке')).toBe('настольный теннис в парке');
  });

  it('приводит к нижнему регистру', () => {
    expect(normalizeSportName('Падел')).toBe('падел');
    expect(normalizeSportName('ФРИСБИ')).toBe('фрисби');
  });

  it('заменяет ё на е в любом регистре', () => {
    expect(normalizeSportName('Ёга на свёкле')).toBe('ега на свекле');
  });

  it('«Падел» и «падел » дают одно и то же имя', () => {
    expect(normalizeSportName('Падел')).toBe(normalizeSportName('падел '));
  });

  it('пустая строка и строка из пробелов дают пустую строку', () => {
    expect(normalizeSportName('')).toBe('');
    expect(normalizeSportName('   ')).toBe('');
  });
});
