import { describe, expect, it } from 'vitest';
import {
  emptyState,
  firstStepWithError,
  formField,
  krasnoyarskTime,
  stepErrors,
  toRequestBody,
} from '../src/features/events/create/form-state';
import type { CreateEventState } from '../src/features/events/create/form-state';

const now = new Date('2026-10-19T12:00:00Z');

const filled = (patch: Partial<CreateEventState> = {}): CreateEventState => ({
  ...emptyState(),
  title: '  Падел для новичков ',
  description: 'Играем пара на пару',
  sport: { kind: 'existing', id: 'sport-1', name: 'Падел', category: 'team' },
  date: '2026-10-25',
  startTime: '19:00',
  endTime: '20:30',
  area: 'Октябрьский',
  placeText: 'Корты у Ветлужанки',
  level: 'beginner',
  mode: 'free',
  ...patch,
});

describe('время по Красноярску', () => {
  it('дата и время поля — момент UTC+7', () => {
    expect(krasnoyarskTime('2026-10-25', '19:00')?.toISOString()).toBe('2026-10-25T12:00:00.000Z');
  });

  it('неполный ввод — нет времени', () => {
    expect(krasnoyarskTime('', '19:00')).toBeNull();
    expect(krasnoyarskTime('2026-10-25', '')).toBeNull();
  });
});

describe('проверки шагов повторяют серверные', () => {
  it('заполненная форма проходит все шаги', () => {
    for (const step of [0, 1, 2, 3] as const) expect(stepErrors(step, filled(), now)).toEqual({});
  });

  it('«Что»: название, направление и описание', () => {
    expect(stepErrors(0, emptyState(), now)).toEqual({
      title: 'Название — от 5 до 80 символов',
      sport: 'Выберите направление из списка или добавьте новое',
      description: 'Добавьте описание',
    });
    expect(stepErrors(0, filled({ title: ' Бег ' }), now).title).toBeDefined();
    expect(stepErrors(0, filled({ title: 'Б'.repeat(81) }), now).title).toBeDefined();
    expect(stepErrors(0, filled({ description: '   ' }), now).description).toBe(
      'Добавьте описание',
    );
    expect(stepErrors(0, filled({ description: 'а'.repeat(2001) }), now).description).toBe(
      'Описание — не длиннее 2000 символов',
    );
  });

  it('«Что»: новое направление — по правилу каталога, как на сервере', () => {
    const sportError = (name: string) =>
      stepErrors(0, filled({ sport: { kind: 'new', name } }), now).sport;
    for (const name of ['Х', 'Х'.repeat(51), 'Падел!!', 'Пaдел']) {
      expect(sportError(name)).toMatch(/^Название направления — от 2 до 50 символов: буквы/);
    }
    expect(sportError('Падел')).toBeUndefined();
    expect(sportError('Футбол 7×7')).toBeUndefined();
  });

  it('длина — в символах, как на сервере: эмодзи считается одним', () => {
    const runner = String.fromCodePoint(0x1f3c3);
    expect(
      stepErrors(0, filled({ title: `${'а'.repeat(79)}${runner}` }), now).title,
    ).toBeUndefined();
    expect(stepErrors(0, filled({ title: `${'а'.repeat(80)}${runner}` }), now).title).toBeDefined();
  });

  it('начало ровно «сейчас» — уже не в будущем', () => {
    const at = filled({ date: '2026-10-19', startTime: '19:00', endTime: '20:00' });
    expect(stepErrors(1, at, new Date('2026-10-19T12:00:00Z')).startTime).toBe(
      'Время начала должно быть в будущем',
    );
    expect(stepErrors(1, at, new Date('2026-10-19T11:59:00Z')).startTime).toBeUndefined();
  });

  it('«Когда и где»: начало в будущем, окончание позже начала, место', () => {
    expect(stepErrors(1, filled({ date: '2026-10-19', startTime: '18:00' }), now).startTime).toBe(
      'Время начала должно быть в будущем',
    );
    expect(stepErrors(1, filled({ endTime: '19:00' }), now).endTime).toBe(
      'Окончание — позже начала',
    );
    expect(
      stepErrors(
        1,
        filled({ date: '', startTime: '', endTime: '', area: 'О', placeText: '' }),
        now,
      ),
    ).toEqual({
      date: 'Укажите дату',
      area: 'Район или ориентир — от 2 до 120 символов',
      placeText: 'Адрес или описание места — от 3 до 300 символов',
    });
    // Без даты ошибка одна — у даты, хотя время заполнено
    expect(stepErrors(1, filled({ date: '' }), now)).toEqual({ date: 'Укажите дату' });
    expect(stepErrors(1, filled({ startTime: '' }), now)).toEqual({
      startTime: 'Укажите время начала',
    });
    expect(stepErrors(1, filled({ city: 'К'.repeat(81) }), now).city).toBeDefined();
  });

  it('«Условия»: уровень и длина информации для участников', () => {
    expect(stepErrors(2, filled({ level: null }), now)).toEqual({ level: 'Выберите уровень' });
    expect(stepErrors(2, filled({ participantInfo: 'а'.repeat(2001) }), now)).toEqual({
      participantInfo: 'Информация для участников — не длиннее 2000 символов',
    });
  });

  it('«Запись»: режим; длина вопроса — только для режима «По заявке»', () => {
    expect(stepErrors(3, filled({ mode: null }), now)).toEqual({ mode: 'Выберите режим записи' });
    const long = 'в'.repeat(301);
    expect(stepErrors(3, filled({ mode: 'approval', applyQuestion: long }), now)).toEqual({
      applyQuestion: 'Вопрос к заявке — не длиннее 300 символов',
    });
    expect(stepErrors(3, filled({ mode: 'free', applyQuestion: long }), now)).toEqual({});
  });
});

describe('символы — то же правило, что у api', () => {
  const char = (...codePoints: number[]) => String.fromCodePoint(...codePoints);

  it('невидимые символы в однострочном и многострочном поле — ошибка у поля', () => {
    expect(stepErrors(0, filled({ title: `Фут${char(0x200b)}бол по средам` }), now).title).toBe(
      'В тексте есть недопустимые символы',
    );
    expect(
      stepErrors(0, filled({ description: `Играем ${char(0x202e)}7 на 7` }), now).description,
    ).toBe('В тексте есть недопустимые символы');
    expect(stepErrors(1, filled({ area: `Цент${char(0x2063)}ральный` }), now).area).toBe(
      'В тексте есть недопустимые символы',
    );
  });

  it('название из одних знаков — нужна буква или цифра', () => {
    expect(stepErrors(0, filled({ title: '— — — — —' }), now).title).toBe(
      'Нужна хотя бы одна буква или цифра',
    );
  });

  it('составной эмодзи, перевод строки в описании и мягкий перенос — допустимы', () => {
    const runner = char(0x1f3c3, 0x200d, 0x2640, 0xfe0f);
    expect(
      stepErrors(
        0,
        filled({
          title: `Бег ${runner} вместе`,
          description: `Пробеж${char(0xad)}ка${char(10)}после — чай`,
        }),
        now,
      ),
    ).toEqual({});
  });

  it('вопрос к заявке в режиме «Свободно» не проверяется — он не уйдёт на сервер', () => {
    const hidden = `Опыт${char(0x2066)}?`;
    expect(stepErrors(3, filled({ mode: 'free', applyQuestion: hidden }), now)).toEqual({});
    expect(stepErrors(3, filled({ mode: 'approval', applyQuestion: hidden }), now)).toEqual({
      applyQuestion: 'В тексте есть недопустимые символы',
    });
  });
});

describe('тело запроса', () => {
  it('выбранное направление — sportId, время — ISO, поля без пробелов по краям', () => {
    expect(toRequestBody(filled({ participantInfo: '  ' }))).toEqual({
      title: 'Падел для новичков',
      description: 'Играем пара на пару',
      sportId: 'sport-1',
      startsAt: '2026-10-25T12:00:00.000Z',
      endsAt: '2026-10-25T13:30:00.000Z',
      city: 'Красноярск',
      area: 'Октябрьский',
      placeText: 'Корты у Ветлужанки',
      mode: 'free',
      level: 'beginner',
    });
  });

  it('новое направление — newSport с группой, только если её выбрали', () => {
    const withGroup = toRequestBody(
      filled({ sport: { kind: 'new', name: ' Падел ', category: 'team' } }),
    );
    expect(withGroup).toMatchObject({ newSport: { name: 'Падел', category: 'team' } });
    expect(withGroup).not.toHaveProperty('sportId');
    expect(toRequestBody(filled({ sport: { kind: 'new', name: 'Падел' } })).newSport).toEqual({
      name: 'Падел',
    });
  });

  it('вопрос к заявке уходит только в режиме «По заявке»', () => {
    const question = { applyQuestion: ' Ваш опыт? ', participantInfo: 'Вход со двора' };
    expect(toRequestBody(filled({ ...question, mode: 'approval' }))).toMatchObject({
      applyQuestion: 'Ваш опыт?',
      participantInfo: 'Вход со двора',
    });
    expect(toRequestBody(filled({ ...question, mode: 'free' }))).not.toHaveProperty(
      'applyQuestion',
    );
  });
});

describe('ошибки сервера', () => {
  it('ведут на первый шаг с ошибкой', () => {
    expect(firstStepWithError({ level: 'x', 'newSport.name': 'x' })).toBe(0);
    expect(firstStepWithError({ endsAt: 'x', mode: 'x' })).toBe(1);
    expect(firstStepWithError({ participantInfo: 'x' })).toBe(2);
    expect(firstStepWithError({ applyQuestion: 'x' })).toBe(3);
    expect(firstStepWithError({})).toBeNull();
    expect(firstStepWithError({ organizerOrgId: 'x' })).toBeNull();
  });

  it('показываются у поля формы', () => {
    expect(formField('sportId')).toBe('sport');
    expect(formField('newSport.name')).toBe('sport');
    expect(formField('startsAt')).toBe('startTime');
    expect(formField('endsAt')).toBe('endTime');
    expect(formField('title')).toBe('title');
  });
});
