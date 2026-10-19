import 'reflect-metadata';
import { Body, Controller, Module, Post } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from '../src/configure-app';
import { ClockModule, ClockStateSource } from '../src/core/clock';
import { STAND_CONFIG } from '../src/core/config';
import { NewSportDto, SPORT_NAME_RULE } from '../src/modules/sports/sports.dto';

// Маршрут-образец: так NewSportDto примет форма создания мероприятия
@Controller('probe')
class ProbeController {
  @Post('new-sport')
  newSport(@Body() body: NewSportDto) {
    return body;
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

const hidden = (...codePoints: number[]) => String.fromCodePoint(...codePoints);

describe('NewSportDto: название нового направления в теле запроса', () => {
  let app: INestApplication;
  const post = (body: object) => request(app.getHttpServer()).post('/probe/new-sport').send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule, ClockModule] })
      .overrideProvider(STAND_CONFIG)
      .useValue({ demoMode: false, standId: null })
      .overrideProvider(ClockStateSource)
      .useValue({ read: async () => ({ offsetSeconds: 0, lastResetAt: null }) })
      .compile();
    app = configureApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('очищает название: NFKC, пробелы по краям и повторные пробелы', async () => {
    const response = await post({
      name: `  Пробны${hidden(0x438, 0x306)}   на  льду `,
      category: 'winter',
    });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ name: 'Пробный на льду', category: 'winter' });
  });

  it('группа необязательна', async () => {
    const response = await post({ name: 'Петанк' });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ name: 'Петанк' });
  });

  it.each([
    ['невидимый символ', `Скры${hidden(0x200b)}тый`],
    ['невидимая «буква»', `Скры${hidden(0x3164)}тый`],
    ['«залго»', `Скрытый${hidden(0x336).repeat(30)}`],
    ['разметка', '<b>Падел</b>'],
    ['одна буква после очистки', '   я   '],
  ])('отклоняет название (%s) ошибкой 400 с полем name', async (_, name) => {
    const response = await post({ name });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'validation_failed',
      message: 'Проверьте поля формы',
      fields: { name: SPORT_NAME_RULE },
    });
  });

  it('отклоняет группу не из списка', async () => {
    const response = await post({ name: 'Петанк', category: 'mind' });
    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual({ category: 'Выберите группу из списка' });
  });
});
