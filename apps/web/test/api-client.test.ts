import { afterEach, describe, expect, it, vi } from 'vitest';
import { loginPath, safeNext } from '../src/features/auth';
import { ApiRequestError, apiRequest } from '../src/shared/api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest', () => {
  it('ходит в /api того же адреса с cookie и JSON-телом', async () => {
    const fetchMock = vi.fn(async () => json(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest('/auth/login', { method: 'POST', body: { a: 1 } })).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":1}',
    });
  });

  it('ошибка api — код, текст для человека и ошибки полей', async () => {
    vi.stubGlobal('fetch', async () =>
      json(409, {
        code: 'conflict',
        message: 'Такая запись уже есть',
        fields: { email: 'Занята' },
      }),
    );
    const error = await apiRequest('/auth/register').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({
      status: 409,
      code: 'conflict',
      message: 'Такая запись уже есть',
      fields: { email: 'Занята' },
    });
  });

  it('ответ без тела ошибки или сеть недоступна — понятный текст', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>', { status: 502 }));
    await expect(apiRequest('/me')).rejects.toMatchObject({
      status: 502,
      message: 'Что-то пошло не так. Попробуйте ещё раз',
    });

    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(apiRequest('/me')).rejects.toMatchObject({ status: 0, code: 'network' });
  });

  it('204 — без тела', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 204 }));
    await expect(apiRequest('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });
});

describe('возврат после входа', () => {
  it('адрес входа помнит, откуда пришли', () => {
    expect(loginPath('/')).toBe('/login');
    expect(loginPath('/events/1?intent=join')).toBe('/login?next=%2Fevents%2F1%3Fintent%3Djoin');
  });

  it('возвращает только на страницы этого сайта', () => {
    expect(safeNext('/my')).toBe('/my');
    expect(safeNext(null)).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('/\\evil.example')).toBe('/');
  });
});
