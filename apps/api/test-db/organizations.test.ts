import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { AUTH_LIMITS } from '../src/modules/auth/attempt-limiter';
import { OrganizationsService } from '../src/modules/organizations/organizations.service';
import { createSport, createUser, databaseUrl, prisma } from './db';

let app: INestApplication;
const char = (...codePoints: number[]) => String.fromCodePoint(...codePoints);

const http = () => request(app.getHttpServer());

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
  const many = { attempts: 10_000, windowMs: 60_000 };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    // Лимиты попыток проверяет auth-limits.test.ts; здесь все регистрации идут с одного адреса
    .overrideProvider(AUTH_LIMITS)
    .useValue({
      loginPerIp: many,
      loginPerEmail: many,
      registerPerIp: many,
      registerPerEmail: many,
    })
    .compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.init();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

async function signUp(accountType: 'person' | 'organization') {
  const email = `${accountType}-${randomUUID()}@example.ru`;
  const response = await http().post('/auth/register').send({
    accountType,
    name: 'Иван Петров',
    email,
    password: 'пароль-1234',
    organizationName: 'Шахматный клуб',
  });
  const header = response.headers['set-cookie'] as unknown as string[];
  const cookie = header.find((line) => line.startsWith('tandem_session='))?.split(';')[0] ?? '';
  return { cookie, body: response.body as { id: string; organization: { id: string } | null } };
}

async function organizationAccount() {
  const { cookie, body } = await signUp('organization');
  if (!body.organization) throw new Error('У аккаунта организации нет организации');
  return { cookie, id: body.organization.id, ownerId: body.id };
}

async function completeProfile(cookie: string, id: string) {
  const sport = await createSport();
  return http()
    .patch(`/organizations/${id}`)
    .set('Cookie', cookie)
    .send({
      description: 'Турниры и занятия для детей и взрослых',
      city: 'Красноярск',
      contacts: '+7 900 000-00-00',
      website: 'https://vk.com/ladya',
      representativeRole: 'Тренер',
      sportIds: [sport.id],
    });
}

async function admin() {
  const user = await createUser();
  await prisma.user.update({ where: { id: user.id }, data: { role: 'admin' } });
  return { role: 'admin' as const, userId: user.id };
}

describe('профиль организации', () => {
  it('владелец видит свою заявку в статусе draft и правит профиль', async () => {
    const { cookie, id } = await organizationAccount();
    const own = await http().get(`/organizations/${id}`).set('Cookie', cookie);
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({
      name: 'Шахматный клуб',
      status: 'draft',
      representativeName: 'Иван Петров',
    });

    const updated = await completeProfile(cookie, id);
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      city: 'Красноярск',
      website: 'https://vk.com/ladya',
      representativeRole: 'Тренер',
      status: 'draft',
    });
    expect(updated.body.sports).toHaveLength(1);

    const noSite = await http()
      .patch(`/organizations/${id}`)
      .set('Cookie', cookie)
      .send({ website: '' });
    expect(noSite.body.website).toBeNull();
  });

  it('свою организацию с данными представителя браузер не кеширует', async () => {
    const { cookie, id } = await organizationAccount();
    const own = await http().get(`/organizations/${id}`).set('Cookie', cookie);
    expect(own.status).toBe(200);
    expect(own.headers['cache-control']).toBe('no-store');
  });

  it('ошибки полей: неверная ссылка и несуществующее направление', async () => {
    const { cookie, id } = await organizationAccount();
    const badSite = await http()
      .patch(`/organizations/${id}`)
      .set('Cookie', cookie)
      .send({ website: 'не ссылка' });
    expect(badSite.status).toBe(400);
    expect(badSite.body.fields).toHaveProperty('website');

    const badSport = await http()
      .patch(`/organizations/${id}`)
      .set('Cookie', cookie)
      .send({ sportIds: [randomUUID()] });
    expect(badSport.status).toBe(400);
    expect(badSport.body.fields).toEqual({ sportIds: 'Такого направления нет в каталоге' });

    const hidden = await createSport();
    await prisma.sport.update({ where: { id: hidden.id }, data: { status: 'hidden' } });
    const hiddenSport = await http()
      .patch(`/organizations/${id}`)
      .set('Cookie', cookie)
      .send({ sportIds: [hidden.id] });
    expect(hiddenSport.status).toBe(400);
    expect(hiddenSport.body.fields).toEqual({ sportIds: 'Такого направления нет в каталоге' });

    const sport = await createSport();
    const repeated = await http()
      .patch(`/organizations/${id}`)
      .set('Cookie', cookie)
      .send({ sportIds: [sport.id, sport.id] });
    expect(repeated.status).toBe(200);
    expect(repeated.body.sports).toEqual([expect.objectContaining({ id: sport.id })]);
  });

  it.each([
    ['переворот текста в названии', { name: `Клуб ${char(0x202e)}Ладья` }, 'name'],
    ['невидимый оператор внутри названия', { name: `Лад${char(0x2063)}ья` }, 'name'],
    ['заполнитель хангыля вместо города', { city: char(0x3164).repeat(3) }, 'city'],
    ['невидимый пробел в контактах', { contacts: `+7 900 ${char(0x200b)}000-00-00` }, 'contacts'],
    [
      'изоляция направления в описании',
      { description: `Турниры ${char(0x2067)}для всех` },
      'description',
    ],
    [
      'управляющий символ у представителя',
      { representativeName: `Иван${char(7)} Петров` },
      'representativeName',
    ],
    [
      'разделитель строк в должности',
      { representativeRole: `Тренер${char(0x2028)}клуба` },
      'representativeRole',
    ],
    ['перевод строки в названии', { name: 'Клуб\nЛадья' }, 'name'],
    ['название из одних точек', { name: '...' }, 'name'],
    ['город из одного тире', { city: '—' }, 'city'],
    [
      'переворот текста в ссылке на сайт',
      { website: `https://ladya.ru/${char(0x202e)}abc` },
      'website',
    ],
  ])('%s — 400 с полем', async (_, change, field) => {
    const { cookie, id } = await organizationAccount();
    const response = await http().patch(`/organizations/${id}`).set('Cookie', cookie).send(change);
    expect(response.status).toBe(400);
    expect(response.body.fields).toHaveProperty(field);
  });

  it('мягкий перенос в названии и городе убирается: организация находится по слову', async () => {
    const { cookie, id } = await organizationAccount();
    const response = await http()
      .patch(`/organizations/${id}`)
      .set('Cookie', cookie)
      .send({ name: `Лад${char(0xad)}ья`, city: `Красно${char(0xad)}ярск` });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ name: 'Ладья', city: 'Красноярск' });
  });

  it('не строка — сообщение о поле, а не о символах', async () => {
    const { cookie, id } = await organizationAccount();
    const response = await http()
      .patch(`/organizations/${id}`)
      .set('Cookie', cookie)
      .send({ name: 5, city: 5, website: 5 });
    expect(response.status).toBe(400);
    expect(response.body.fields).toEqual({
      name: 'Укажите название',
      city: 'Укажите город',
      website: 'Ссылка на сайт или соцсеть, например https://vk.com/club',
    });
  });

  it('эмодзи, переводы строк в описании и контактах допустимы; переводы строк Windows — как обычные', async () => {
    const { cookie, id } = await organizationAccount();
    const chess = String.fromCodePoint(0x265f, 0xfe0f);
    const response = await http()
      .patch(`/organizations/${id}`)
      .set('Cookie', cookie)
      .send({
        name: `Ладья ${chess}`,
        description: 'Турниры\r\nи занятия',
        contacts: '+7 900 000-00-00\r\nTelegram @ladya',
      });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      name: `Ладья ${chess}`,
      description: 'Турниры\nи занятия',
      contacts: '+7 900 000-00-00\nTelegram @ladya',
    });
  });

  it('при регистрации организации имя и название проверяются тем же правилом', async () => {
    for (const change of [
      { organizationName: `Клуб ${char(0x202e)}Ладья` },
      { name: `Иван${char(0x2063)}` },
      { organizationName: '...' },
      // Почта с невидимым символом выглядела бы как чужая и стала бы отдельным аккаунтом
      { email: `an${char(0x200b)}na-${randomUUID()}@example.ru` },
    ]) {
      const response = await http()
        .post('/auth/register')
        .send({
          accountType: 'organization',
          name: 'Иван Петров',
          email: `org-${randomUUID()}@example.ru`,
          password: 'пароль-1234',
          organizationName: 'Шахматный клуб',
          ...change,
        });
      expect(response.status).toBe(400);
      expect(Object.keys(response.body.fields)).toEqual(Object.keys(change));
    }
  });

  it('чужую организацию не правит ни другая организация, ни пользователь; гостю — 401', async () => {
    const { id } = await organizationAccount();
    const otherOrg = await organizationAccount();
    const person = await signUp('person');

    const byOrg = await http()
      .patch(`/organizations/${id}`)
      .set('Cookie', otherOrg.cookie)
      .send({ city: 'X' });
    expect(byOrg.status).toBe(403);
    expect(byOrg.body.code).toBe('not_organization_owner');
    const byUser = await http()
      .patch(`/organizations/${id}`)
      .set('Cookie', person.cookie)
      .send({ city: 'X' });
    expect(byUser.status).toBe(403);
    expect((await http().patch(`/organizations/${id}`).send({ city: 'X' })).status).toBe(401);
  });

  it('неодобренная организация по прямой ссылке для других — 404, как и неверный адрес', async () => {
    const { id } = await organizationAccount();
    const person = await signUp('person');
    expect((await http().get(`/organizations/${id}`)).status).toBe(404);
    expect((await http().get(`/organizations/${id}`).set('Cookie', person.cookie)).status).toBe(
      404,
    );
    expect((await http().get('/organizations/не-uuid')).status).toBe(404);
  });
});

describe('отправка на проверку и решение администратора', () => {
  it('неполный профиль не отправляется: недостающие поля названы', async () => {
    const { cookie, id } = await organizationAccount();
    const response = await http().post(`/organizations/${id}/submit`).set('Cookie', cookie);
    expect(response.status).toBe(400);
    expect(Object.keys(response.body.fields)).toEqual(
      expect.arrayContaining(['description', 'city', 'contacts', 'representativeRole', 'sportIds']),
    );
  });

  it('draft → pending; повторно отправить нельзя', async () => {
    const { cookie, id } = await organizationAccount();
    await completeProfile(cookie, id);
    const submitted = await http().post(`/organizations/${id}/submit`).set('Cookie', cookie);
    expect(submitted.status).toBe(200);
    expect(submitted.body.status).toBe('pending');
    expect(submitted.body.submittedAt).toEqual(expect.any(String));

    const again = await http().post(`/organizations/${id}/submit`).set('Cookie', cookie);
    expect(again.status).toBe(409);
    expect(again.body.message).toBe('Заявка уже на проверке или одобрена');
  });

  it('actions[] по статусу: владельцу — правка, отправка и создание, администратору — решение', async () => {
    const { cookie, id } = await organizationAccount();
    const codes = (body: { actions: { code: string; enabled: boolean }[] }) =>
      Object.fromEntries(body.actions.map((action) => [action.code, action.enabled]));

    const draft = await http().get(`/organizations/${id}`).set('Cookie', cookie);
    expect(codes(draft.body)).toEqual({
      edit_organization: true,
      submit_organization: true,
      create_event: false,
    });

    await completeProfile(cookie, id);
    const submitted = await http().post(`/organizations/${id}/submit`).set('Cookie', cookie);
    expect(codes(submitted.body)).toEqual({
      edit_organization: true,
      submit_organization: false,
      create_event: false,
    });

    // Вход человеком, затем роль администратора: actor строится из базы на каждый запрос
    const person = await signUp('person');
    await prisma.user.update({ where: { id: person.body.id }, data: { role: 'admin' } });
    const reviewer = { role: 'admin' as const, userId: person.body.id as string };
    const forAdmin = await http().get(`/organizations/${id}`).set('Cookie', person.cookie);
    expect(forAdmin.body.actions).toEqual([{ code: 'review_organization', enabled: true }]);

    const decided = await app.get(OrganizationsService).decide(reviewer, id, 'approve');
    expect(decided.actions).toEqual([
      expect.objectContaining({ code: 'review_organization', enabled: false }),
    ]);
    const approved = await http().get(`/organizations/${id}`).set('Cookie', cookie);
    expect(codes(approved.body)).toEqual({ edit_organization: true, create_event: true });

    // Публичная страница — без действий
    const page = await http().get(`/organizations/${id}`);
    expect(page.body).not.toHaveProperty('actions');
  });

  it('отклонение с причиной публикует OrganizationDecided; после правки — повторная отправка', async () => {
    const { cookie, id } = await organizationAccount();
    await completeProfile(cookie, id);
    await http().post(`/organizations/${id}/submit`).set('Cookie', cookie);
    const decided = new Promise((resolve) => {
      app.get(EventEmitter2).once('OrganizationDecided', resolve);
    });

    const service = app.get(OrganizationsService);
    const actor = await admin();
    const rejected = await service.decide(actor, id, 'reject', 'Нет контактов клуба');
    expect(rejected).toMatchObject({ status: 'rejected', decisionReason: 'Нет контактов клуба' });
    expect(await decided).toMatchObject({
      type: 'OrganizationDecided',
      organizationId: id,
      decision: 'rejected',
      reason: 'Нет контактов клуба',
      actorId: actor.userId,
    });

    const own = await http().get(`/organizations/${id}`).set('Cookie', cookie);
    expect(own.body).toMatchObject({ status: 'rejected', decisionReason: 'Нет контактов клуба' });

    await http()
      .patch(`/organizations/${id}`)
      .set('Cookie', cookie)
      .send({ contacts: 'ladya@mail.ru' });
    const resubmitted = await http().post(`/organizations/${id}/submit`).set('Cookie', cookie);
    expect(resubmitted.body).toMatchObject({ status: 'pending', decisionReason: null });
  });

  it('отклонить без причины нельзя; решать может только администратор', async () => {
    const { cookie, id, ownerId } = await organizationAccount();
    await completeProfile(cookie, id);
    await http().post(`/organizations/${id}/submit`).set('Cookie', cookie);
    const service = app.get(OrganizationsService);

    await expect(service.decide(await admin(), id, 'reject')).rejects.toMatchObject({
      code: 'reason_required',
    });
    await expect(
      service.decide({ role: 'user', userId: ownerId }, id, 'approve'),
    ).rejects.toMatchObject({ code: 'admins_only' });
  });

  it('после одобрения публичная страница открыта всем — без представителя', async () => {
    const { cookie, id } = await organizationAccount();
    await completeProfile(cookie, id);
    await http().post(`/organizations/${id}/submit`).set('Cookie', cookie);
    await app.get(OrganizationsService).decide(await admin(), id, 'approve');

    const page = await http().get(`/organizations/${id}`);
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({ name: 'Шахматный клуб', city: 'Красноярск' });
    expect(page.body).not.toHaveProperty('representativeName');
    expect(page.body).not.toHaveProperty('status');

    // Одобренная организация меняет профиль сразу, без повторной проверки (ТЗ 2.9, п. 7)
    const edited = await http()
      .patch(`/organizations/${id}`)
      .set('Cookie', cookie)
      .send({ city: 'Дивногорск' });
    expect(edited.body).toMatchObject({ status: 'approved', city: 'Дивногорск' });
  });

  it('после отправки обязательные поля не очищаются — ни на проверке, ни у одобренной', async () => {
    const { cookie, id } = await organizationAccount();
    await completeProfile(cookie, id);
    await http().post(`/organizations/${id}/submit`).set('Cookie', cookie);
    const emptied = { description: '', city: '   ', contacts: '', sportIds: [] };

    const pending = await http().patch(`/organizations/${id}`).set('Cookie', cookie).send(emptied);
    expect(pending.status).toBe(400);
    expect(Object.keys(pending.body.fields).sort()).toEqual([
      'city',
      'contacts',
      'description',
      'sportIds',
    ]);

    await app.get(OrganizationsService).decide(await admin(), id, 'approve');
    const approved = await http()
      .patch(`/organizations/${id}`)
      .set('Cookie', cookie)
      .send({ representativeName: '' });
    expect(approved.status).toBe(400);
    expect(approved.body.fields).toEqual({ representativeName: 'Укажите, кто представитель' });

    const page = await http().get(`/organizations/${id}`);
    expect(page.body).toMatchObject({ city: 'Красноярск', contacts: '+7 900 000-00-00' });
    expect(page.body.sports).toHaveLength(1);
  });
});
