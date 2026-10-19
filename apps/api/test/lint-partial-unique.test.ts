import { describe, expect, it } from 'vitest';
import { projectEslint } from './lint';

const ruleMessages = projectEslint();
const restricted = (code: string, file: string) => ruleMessages('no-restricted-syntax', code, file);

describe('правило ESLint о ключах частичных индексов', () => {
  it.each([
    'apps/api/src/modules/participations/participations.repository.ts',
    'apps/api/src/core/clock/clock.ts',
    'apps/api/test-db/participations.test.ts',
  ])('запрещает eventId_userId и userId_accessoryId в %s', async (file) => {
    const code = [
      'declare const db: any;',
      'db.participation.update({ where: { eventId_userId: { eventId: "e", userId: "u" } } });',
      "db.userAccessory.delete({ where: { 'userId_accessoryId': { userId: 'u', accessoryId: 'a' } } });",
      '',
    ].join('\n');
    expect(await restricted(code, file)).toBe(2);
  });

  it('разрешает поиск записи по id и фильтры по полям', async () => {
    const code = [
      'declare const db: any;',
      'db.participation.update({ where: { id: "p" } });',
      'db.participation.findFirst({ where: { eventId: "e", userId: "u", status: { not: "cancelled" } } });',
      '',
    ].join('\n');
    expect(await restricted(code, 'apps/api/src/modules/participations/x.ts')).toBe(0);
  });
});
