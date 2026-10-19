import { SetMetadata } from '@nestjs/common';

/** Роли вошедших: гость — это отсутствие входа, а не роль. */
export type SignedInRole = 'user' | 'org' | 'admin';

export const ROLES_KEY = 'access:roles';
export const PUBLIC_KEY = 'access:public';

/** Маршрут доступен только этим ролям: гостю — 401, остальным — 403. */
export const Roles = (...roles: SignedInRole[]) => SetMetadata(ROLES_KEY, roles);

/** Маршрут доступен любому, кто вошёл. */
export const SignedIn = () => Roles('user', 'org', 'admin');

/**
 * Маршрут открыт и гостю. Без этой метки и без `@Roles` маршрут требует
 * входа: забытая метка не должна открыть гостю чужие данные. Ставится только
 * на метод: на контроллере она открыла бы и методы, добавленные позже.
 */
export const Public = (): MethodDecorator => SetMetadata(PUBLIC_KEY, true);
