import { describe, expect, it } from 'vitest';
import { sameOriginWrites } from '../src/core/errors';

function run(method: string, headers: Record<string, string>) {
  const result: { passed: boolean; status?: number; body?: unknown } = { passed: false };
  const response = {
    status(code: number) {
      result.status = code;
      return {
        json(body: unknown) {
          result.body = body;
        },
      };
    },
  };
  sameOriginWrites()({ method, headers }, response, () => {
    result.passed = true;
  });
  return result;
}

const json = { 'content-type': 'application/json', 'content-length': '20' };

describe('изменяющие запросы только со своего стенда и в JSON', () => {
  it('чтение не проверяется', () => {
    expect(run('GET', { 'sec-fetch-site': 'cross-site' }).passed).toBe(true);
  });

  it('JSON со своей страницы проходит', () => {
    expect(run('POST', { ...json, 'sec-fetch-site': 'same-origin' }).passed).toBe(true);
    // Адрес набран вручную, закладка — не другой сайт
    expect(run('POST', { ...json, 'sec-fetch-site': 'none' }).passed).toBe(true);
  });

  it('с другого сайта — 403, даже соседний стенд на другом порту', () => {
    for (const site of ['cross-site', 'same-site']) {
      const result = run('POST', { ...json, 'sec-fetch-site': site });
      expect(result).toMatchObject({
        passed: false,
        status: 403,
        body: { code: 'cross_site_request', message: 'Запрос с другого сайта отклонён' },
      });
    }
  });

  it('без Sec-Fetch-Site сверяется Origin с адресом стенда', () => {
    const host = { host: '109.196.167.209:8081' };
    expect(run('POST', { ...json, ...host, origin: 'http://109.196.167.209:8081' }).passed).toBe(
      true,
    );
    expect(run('POST', { ...json, ...host, origin: 'http://109.196.167.209:8082' }).status).toBe(
      403,
    );
    expect(run('POST', { ...json, ...host, origin: 'null' }).status).toBe(403);
    // Ни Origin, ни Sec-Fetch-Site: не браузер (curl, тесты) — проверять нечего
    expect(run('POST', { ...json, ...host }).passed).toBe(true);
  });

  it('тело не в JSON — 415: обычная HTML-форма до маршрута не доходит', () => {
    for (const type of [
      'application/x-www-form-urlencoded',
      'multipart/form-data; boundary=x',
      'text/plain',
    ]) {
      const result = run('POST', { 'content-type': type, 'content-length': '30' });
      expect(result).toMatchObject({
        passed: false,
        status: 415,
        body: { code: 'unsupported_media_type' },
      });
    }
    expect(
      run('PATCH', { 'content-type': 'application/json; charset=utf-8', 'content-length': '2' })
        .passed,
    ).toBe(true);
  });

  it('запрос без тела (выход, отправка на проверку) типом не ограничен', () => {
    expect(run('POST', { 'sec-fetch-site': 'same-origin' }).passed).toBe(true);
    expect(run('DELETE', { 'content-length': '0' }).passed).toBe(true);
  });
});
