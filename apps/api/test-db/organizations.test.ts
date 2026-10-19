import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { OrganizationsService } from '../src/modules/organizations/organizations.service';
import { createSport, createUser, databaseUrl, prisma } from './db';

let app: INestApplication;
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
});
