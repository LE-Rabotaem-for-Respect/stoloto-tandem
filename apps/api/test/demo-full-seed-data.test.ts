import { isValidSportName } from '@tandem/domain';
import { describe, expect, it } from 'vitest';
import {
  SEED_ACCOUNTS,
  SEED_BACKGROUND_PEOPLE,
  SEED_CUSTOM_SPORT,
  SEED_EVENTS,
  SEED_SPORTS,
} from '../src/modules/demo/seed-data';
import type { SeedEvent } from '../src/modules/demo/seed-data';

const event = (title: string): SeedEvent => {
  const found = SEED_EVENTS.find((item) => item.title === title);
  if (!found) throw new Error(`Нет мероприятия «${title}»`);
  return found;
};

describe('полный сид: фоновые участники (ТЗ 4.6)', () => {
  it('десять человек, почта — имя латиницей, как в docs/scenarios.md', () => {
    expect(SEED_BACKGROUND_PEOPLE.map((person) => `${person.key}:${person.name}`)).toEqual([
      'maria:Мария',
      'dmitry:Дмитрий',
      'olga:Ольга',
      'sergey:Сергей',
      'elena:Елена',
      'kirill:Кирилл',
      'natalya:Наталья',
      'artem:Артём',
      'ksenia:Ксения',
      'pavel:Павел',
    ]);
  });
});

describe('полный сид: мероприятия (ТЗ 4.6, docs/scenarios.md)', () => {
  it('десять мероприятий девяти направлений', () => {
    expect(SEED_EVENTS).toHaveLength(10);
    expect(new Set(SEED_EVENTS.map((item) => item.sport)).size).toBe(9);
  });

  it('направления — из каталога, кроме пользовательского «Петанк» Сергея', () => {
    const catalog = new Set(SEED_SPORTS.map((sport) => sport.name));
    const outside = SEED_EVENTS.map((item) => item.sport).filter((name) => !catalog.has(name));
    expect(outside).toEqual(['Петанк']);
    expect(SEED_CUSTOM_SPORT).toEqual({ name: 'Петанк', category: 'other', createdBy: 'sergey' });
    expect(isValidSportName(SEED_CUSTOM_SPORT.name)).toBe(true);
  });

  it('организаторы и участники — люди из сида, организатор не записан на своё', () => {
    const people = new Set([
      ...SEED_ACCOUNTS.map((account) => account.key),
      ...SEED_BACKGROUND_PEOPLE.map((person) => person.key),
    ]);
    for (const item of SEED_EVENTS) {
      const organizer = 'org' in item.organizer ? item.organizer.org : item.organizer.user;
      expect(people.has(organizer), item.title).toBe(true);
      const all = [...item.participants, ...item.requests.map((request) => request.person)];
      for (const person of all) expect(people.has(person), `${item.title}: ${person}`).toBe(true);
      expect(all, item.title).not.toContain(organizer);
      expect(new Set(all).size, item.title).toBe(all.length);
    }
  });

  it('«Футбол 7×7»: по заявке на 14 мест, 8 участников, 3 заявки с ответами', () => {
    const football = event('Футбол 7×7 по средам');
    expect(football).toMatchObject({
      organizer: { user: 'igor' },
      mode: 'approval',
      capacity: 14,
      applyQuestion: 'На какой позиции играете?',
      price: 300,
      when: { weekdays: [3], from: '19:00', to: '20:30' },
    });
    expect(football.participants).toEqual([
      'maria',
      'olga',
      'elena',
      'kirill',
      'natalya',
      'ksenia',
      'pavel',
      'petr',
    ]);
    expect(football.requests).toEqual([
      { person: 'dmitry', answer: 'Защитник' },
      { person: 'sergey', answer: 'Вратарь' },
      { person: 'artem', answer: 'Где нужно' },
    ]);
  });

  it('«Пробежка»: 6 мест заполнены, лист ожидания пуст', () => {
    const run = event('Пробежка 5 км на острове Татышев');
    expect(run.capacity).toBe(6);
    expect(run.participants).toHaveLength(6);
    expect(run.firstTimersOk).toBe(true);
    expect(run.when).toEqual({ days: 2, from: '08:00', to: '09:00' });
  });

  it('«Скалолазание»: две заявки и ни одного участника', () => {
    const climbing = event('Скалолазание для начинающих');
    expect(climbing.participants).toEqual([]);
    expect(climbing.requests.map((request) => request.person)).toEqual(['ksenia', 'artem']);
    expect(climbing.applyQuestion).toBe('Ваш опыт?');
  });

  it('«Волейбол на песке» снят модератором с причиной', () => {
    expect(event('Волейбол на песке')).toMatchObject({
      unpublishedReason: 'Площадка закрыта на ремонт',
      participants: ['anna', 'kirill'],
    });
  });

  it('«Йога на рассвете» завершилась 12 дней назад', () => {
    expect(event('Йога на рассвете').when).toEqual({ days: -12, from: '05:30', to: '06:30' });
  });

  it('«Блиц-турнир» и «Шахматы для детей» — от организации «Ладья»', () => {
    expect(event('Блиц-турнир в клубе «Ладья»').organizer).toEqual({ org: 'ladya' });
    expect(event('Шахматы для детей и родителей').organizer).toEqual({ org: 'ladya' });
  });

  it('«Информация для участников» — у четырёх мероприятий из таблицы', () => {
    const withInfo = SEED_EVENTS.filter((item) => item.participantInfo).map((item) => item.title);
    expect(withInfo.sort()).toEqual(
      [
        'Футбол 7×7 по средам',
        'Блиц-турнир в клубе «Ладья»',
        'Пробежка 5 км на острове Татышев',
        'Скалолазание для начинающих',
      ].sort(),
    );
  });

  it('обсуждения: вопрос участника и ответ организатора у трёх мероприятий', () => {
    const withMessages = SEED_EVENTS.filter((item) => item.messages.length);
    expect(withMessages.map((item) => item.title)).toEqual([
      'Футбол 7×7 по средам',
      'Блиц-турнир в клубе «Ладья»',
      'Пробежка 5 км на острове Татышев',
    ]);
    expect(event('Футбол 7×7 по средам').messages).toEqual([
      {
        author: 'dmitry',
        text: 'Нужны бутсы или можно в кроссовках?',
        reply: 'Газон искусственный, подойдут многошиповки или кроссовки',
      },
    ]);
  });

  it('время окончания позже начала у каждого мероприятия', () => {
    for (const item of SEED_EVENTS) expect(item.when.to > item.when.from, item.title).toBe(true);
  });
});
