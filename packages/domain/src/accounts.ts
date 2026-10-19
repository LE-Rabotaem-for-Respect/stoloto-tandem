/** Почта хранится и сравнивается нормализованной: без пробелов по краям, в нижнем регистре. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Домен демо-аккаунтов (ТЗ 4.6); при регистрации он занят. */
export const DEMO_EMAIL_DOMAIN = 'demo';

export const isDemoEmail = (email: string): boolean =>
  normalizeEmail(email).endsWith(`@${DEMO_EMAIL_DOMAIN}`);

/**
 * Аккаунты «Быстрого входа для проверки» (ТЗ 2.6, 4.6). Демо-вход принимает
 * только эти ключи; почта — `<ключ>@demo`, пароль у всех — `demo`.
 * Фоновые участники входят по почте и в быстрый вход не выносятся.
 */
export const DEMO_ACCOUNTS = [
  { key: 'anna', name: 'Анна', role: 'Пользователь' },
  { key: 'igor', name: 'Игорь', role: 'Организатор' },
  { key: 'petr', name: 'Пётр Иванович', role: 'Пользователь, крупный текст' },
  { key: 'ladya', name: 'Шахматный клуб «Ладья»', role: 'Организация, одобрена' },
  { key: 'padel', name: 'Падел-клуб Енисей', role: 'Организация на рассмотрении' },
  { key: 'stolby', name: 'Беговой клуб «Столбы»', role: 'Организация на рассмотрении' },
  { key: 'yoga', name: 'Йога в парке', role: 'Организация, отклонена' },
  { key: 'admin', name: 'Администратор', role: 'Администратор' },
] as const;

export type DemoAccountKey = (typeof DEMO_ACCOUNTS)[number]['key'];

export const DEMO_ACCOUNT_KEYS: readonly DemoAccountKey[] = DEMO_ACCOUNTS.map(
  (account) => account.key,
);

export const demoAccountEmail = (key: DemoAccountKey): string => `${key}@${DEMO_EMAIL_DOMAIN}`;
