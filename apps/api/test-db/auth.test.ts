import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { STAND_CONFIG } from '../src/core/config';
import { AUTH_LIMITS } from '../src/modules/auth/attempt-limiter';
import { hashPassword } from '../src/modules/auth/password';
import { databaseUrl, prisma } from './db';

const COOKIE = 'tandem_session';
const many = { attempts: 10_000, windowMs: 60_000 };
const UNLIMITED = {
  loginPerIp: many,
  loginPerEmail: many,
  registerPerIp: many,
  registerPerEmail: many,
};

async function startApp(demoMode: boolean): Promise<INestApplication> {
  process.env.DATABASE_URL = databaseUrl;
  process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(STAND_CONFIG)
    .useValue({ demoMode, standId: null })
    // Лимиты попыток проверяет auth-limits.test.ts; здесь все запросы идут с одного адреса
    .overrideProvider(AUTH_LIMITS)
    .useValue(UNLIMITED)
    .compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.init();
  return app;
}

/** `tandem_session=…` из ответа — для следующего запроса. */
function sessionCookie(response: request.Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((line) => line.startsWith(`${COOKIE}=`));
  if (!cookie) throw new Error('В ответе нет cookie сессии');
  return cookie.split(';')[0] ?? '';
}

const email = () => `anna-${randomUUID()}@example.ru`;

let app: INestApplication;
let demoApp: INestApplication;

beforeAll(async () => {
  [app, demoApp] = await Promise.all([startApp(false), startApp(true)]);
  await prisma.user.create({
    data: {
      name: 'Анна',
      email: 'anna@demo',
      passwordHash: await hashPassword('demo'),
      createdAt: new Date('2026-10-19T00:00:00Z'),
    },
  });
});

afterAll(async () => {
  await Promise.all([app.close(), demoApp.close()]);
  await prisma.$disconnect();
});

describe('регистрация', () => {
  it('«Я — человек»: аккаунт user, вход сразу, в ответе нет хеша пароля', async () => {
    const address = email();
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        accountType: 'person',
        name: ' Анна ',
        email: ` ${address.toUpperCase()} `,
        password: 'пароль-1234',
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      role: 'user',
      name: 'Анна',
      email: address,
      organization: null,
    });
    expect(JSON.stringify(response.body)).not.toMatch(/password|argon2/i);
    const setCookie = String(response.headers['set-cookie']);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: address } });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored.passwordHash).not.toContain('пароль-1234');
  });

  it('«Я — организация»: аккаунт org и своя организация в статусе draft', async () => {
    const address = email();
    const response = await request(app.getHttpServer()).post('/auth/register').send({
      accountType: 'organization',
      name: 'Иван Петров',
      email: address,
      password: 'пароль-1234',
      organizationName: 'Шахматный клуб',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      role: 'org',
      organization: { name: 'Шахматный клуб', status: 'draft' },
    });
    const organization = await prisma.organization.findFirstOrThrow({
      where: { owner: { email: address } },
    });
    expect(organization).toMatchObject({ status: 'draft', representativeName: 'Иван Петров' });
  });

  it('организации без названия — ошибка у поля', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ accountType: 'organization', name: 'Иван', email: email(), password: 'пароль-1234' });
    expect(response.status).toBe(400);
    expect(response.body.fields).toHaveProperty('organizationName');
  });

  it('занятая почта в другом регистре — 409 с полем email', async () => {
    const address = email();
    const body = { accountType: 'person', name: 'Анна', password: 'пароль-1234' };
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ ...body, email: address });
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ ...body, email: address.toUpperCase() });
    expect(response.status).toBe(409);
    expect(response.body.fields).toEqual({ email: 'Эта почта уже зарегистрирована' });
  });

  it('адреса @demo не регистрируются: у них нет домена верхнего уровня', async () => {
    const response = await request(demoApp.getHttpServer())
      .post('/auth/register')
      .send({ accountType: 'person', name: 'Анна', email: 'maria@demo', password: 'пароль-1234' });
    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual({ email: 'Укажите почту, например anna@mail.ru' });
  });

  it('мягкий перенос в почте — ошибка поля: иначе второй аккаунт выглядит как первый', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        accountType: 'person',
        name: 'Анна',
        email: `an­na-${randomUUID()}@example.ru`,
        password: 'пароль-1234',
      });
    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual({ email: 'В тексте есть недопустимые символы' });
  });

  it('роль из тела запроса не принимается', async () => {
    const response = await request(app.getHttpServer()).post('/auth/register').send({
      accountType: 'person',
      name: 'Анна',
      email: email(),
      password: 'пароль-1234',
      role: 'admin',
    });
    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual({ role: 'Лишнее поле' });
  });
});

describe('вход, профиль и выход', () => {
  async function registered() {
    const address = email();
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ accountType: 'person', name: 'Анна', email: address, password: 'пароль-1234' });
    return address;
  }

  it('вход по почте и паролю, затем GET /me', async () => {
    const address = await registered();
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: address, password: 'пароль-1234' });
    expect(login.status).toBe(200);

    const me = await request(app.getHttpServer()).get('/me').set('Cookie', sessionCookie(login));
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email: address, role: 'user' });
    expect(me.body).not.toHaveProperty('passwordHash');
  });

  it('неверный пароль и незнакомая почта — одинаковый ответ 401', async () => {
    const address = await registered();
    const wrongPassword = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: address, password: 'не тот' });
    const unknown = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: email(), password: 'пароль-1234' });

    for (const response of [wrongPassword, unknown]) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        code: 'invalid_credentials',
        message: 'Неверная почта или пароль',
      });
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });

  it('пустые поля входа — «Укажите почту» и «Укажите пароль»', async () => {
    const response = await request(app.getHttpServer()).post('/auth/login').send({});
    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual({ email: 'Укажите почту', password: 'Укажите пароль' });
  });

  it('вход обычной формой с чужого сайта отклоняется до маршрута и без cookie', async () => {
    const address = await registered();
    const form = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', 'http://evil.example')
      .type('form')
      .send({ email: address, password: 'пароль-1234' });
    expect(form.status).toBe(403);
    expect(form.headers['set-cookie']).toBeUndefined();

    const formSameSite = await request(app.getHttpServer())
      .post('/auth/login')
      .type('form')
      .send({ email: address, password: 'пароль-1234' });
    expect(formSameSite.status).toBe(415);
    expect(formSameSite.headers['set-cookie']).toBeUndefined();

    const crossSite = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Sec-Fetch-Site', 'cross-site')
      .send({ email: address, password: 'пароль-1234' });
    expect(crossSite.status).toBe(403);
    expect(crossSite.headers['set-cookie']).toBeUndefined();
  });

  it('GET /me без входа — 401', async () => {
    const response = await request(app.getHttpServer()).get('/me');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('unauthorized');
  });

  it('выход отзывает сессию: старая cookie больше не работает', async () => {
    const address = await registered();
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: address, password: 'пароль-1234' });
    const cookie = sessionCookie(login);

    const logout = await request(app.getHttpServer()).post('/auth/logout').set('Cookie', cookie);
    expect(logout.status).toBe(204);
    expect(String(logout.headers['set-cookie'])).toMatch(new RegExp(`${COOKIE}=;`));

    const me = await request(app.getHttpServer()).get('/me').set('Cookie', cookie);
    expect(me.status).toBe(401);
  });

  it('«Сменить аккаунт»: вход под другим пользователем отзывает прежнюю сессию', async () => {
    const [first, second] = [await registered(), await registered()];
    const firstLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: first, password: 'пароль-1234' });
    const firstCookie = sessionCookie(firstLogin);

    const secondLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Cookie', firstCookie)
      .send({ email: second, password: 'пароль-1234' });
    expect(secondLogin.status).toBe(200);

    expect((await request(app.getHttpServer()).get('/me').set('Cookie', firstCookie)).status).toBe(
      401,
    );
    const me = await request(app.getHttpServer())
      .get('/me')
      .set('Cookie', sessionCookie(secondLogin));
    expect(me.body.email).toBe(second);
  });

  it('истёкшая сессия — гость; в базе хранится не сам токен', async () => {
    const address = await registered();
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: address, password: 'пароль-1234' });
    const cookie = sessionCookie(login);
    const token = decodeURIComponent(cookie.split('=')[1] ?? '');

    const user = await prisma.user.findUniqueOrThrow({ where: { email: address } });
    const sessions = await prisma.session.findMany({ where: { userId: user.id } });
    expect(sessions.some((session) => session.tokenHash === token)).toBe(false);

    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date('2000-01-01T00:00:00Z') },
    });
    expect((await request(app.getHttpServer()).get('/me').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('демо-вход', () => {
  it('без DEMO_MODE маршрута нет — 404', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/demo-login')
      .send({ account: 'anna' });
    expect(response.status).toBe(404);
  });

  it('без DEMO_MODE 404 и с неверным телом: маршрут не выдаёт себя ошибкой полей', async () => {
    for (const body of [{ account: 'x' }, {}, { account: 'anna', extra: 1 }]) {
      const response = await request(app.getHttpServer()).post('/auth/demo-login').send(body);
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('not_found');
    }
  });

  it('сессия демо-аккаунта не действует на стенде без DEMO_MODE', async () => {
    const quick = await request(demoApp.getHttpServer())
      .post('/auth/demo-login')
      .send({ account: 'anna' });
    const cookie = sessionCookie(quick);

    expect((await request(demoApp.getHttpServer()).get('/me').set('Cookie', cookie)).status).toBe(
      200,
    );
    expect((await request(app.getHttpServer()).get('/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('без DEMO_MODE демо-аккаунт не входит и с верным паролем', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'anna@demo', password: 'demo' });
    expect(response.status).toBe(401);
  });

  it('в демо-режиме: быстрый вход по ключу и обычный вход с паролем demo', async () => {
    const quick = await request(demoApp.getHttpServer())
      .post('/auth/demo-login')
      .send({ account: 'anna' });
    expect(quick.status).toBe(200);
    expect(quick.body).toMatchObject({ email: 'anna@demo', role: 'user' });

    const login = await request(demoApp.getHttpServer())
      .post('/auth/login')
      .send({ email: 'anna@demo', password: 'demo' });
    expect(login.status).toBe(200);
  });

  it('принимает только ключ из списка, а не почту', async () => {
    for (const account of ['maria', 'anna@demo', 'admin@demo']) {
      const response = await request(demoApp.getHttpServer())
        .post('/auth/demo-login')
        .send({ account });
      expect(response.status).toBe(400);
    }
  });

  it('аккаунта нет в базе — понятная подсказка', async () => {
    const response = await request(demoApp.getHttpServer())
      .post('/auth/demo-login')
      .send({ account: 'yoga' });
    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Демо-аккаунта нет в базе — сбросьте демо-данные');
  });
});
