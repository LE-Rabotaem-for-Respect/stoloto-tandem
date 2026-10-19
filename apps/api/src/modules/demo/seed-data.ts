import type { DemoAccountKey, OrganizationStatus } from '@tandem/domain';
import type { SkillLevel, SportCategory, UserRole } from '../../generated/prisma/client';

/** Направление стартового каталога (ТЗ 2.3). */
export interface SeedSport {
  name: string;
  category: SportCategory;
  aliases: readonly string[];
}

/**
 * Стартовый каталог — около 25 направлений во всех 8 группах: массовые,
 * интеллектуальные, бытовые и нишевые. «Петанк» сюда не входит: его
 * добавляет пользователь как новое направление (ТЗ 4.6).
 */
export const SEED_SPORTS: readonly SeedSport[] = [
  { name: 'Футбол', category: 'team', aliases: ['мини-футбол'] },
  { name: 'Баскетбол', category: 'team', aliases: ['стритбол'] },
  { name: 'Волейбол', category: 'team', aliases: ['пляжный волейбол'] },
  { name: 'Бег', category: 'endurance', aliases: ['пробежка', 'джоггинг'] },
  { name: 'Велоспорт', category: 'endurance', aliases: ['велосипед'] },
  { name: 'Скандинавская ходьба', category: 'endurance', aliases: ['нордик-уокинг'] },
  { name: 'Шахматы', category: 'intellectual', aliases: ['блиц'] },
  { name: 'Шашки', category: 'intellectual', aliases: [] },
  { name: 'Бокс', category: 'martial', aliases: [] },
  { name: 'Дзюдо', category: 'martial', aliases: [] },
  { name: 'Самбо', category: 'martial', aliases: [] },
  { name: 'Зарядка', category: 'fitness', aliases: ['зарядка во дворе', 'утренняя зарядка'] },
  { name: 'Йога', category: 'fitness', aliases: [] },
  { name: 'Воркаут', category: 'fitness', aliases: ['турники'] },
  { name: 'Пилатес', category: 'fitness', aliases: [] },
  { name: 'Плавание', category: 'water', aliases: ['бассейн'] },
  { name: 'Сап-сёрфинг', category: 'water', aliases: ['сап', 'sup'] },
  { name: 'Лыжи', category: 'winter', aliases: ['беговые лыжи'] },
  { name: 'Коньки', category: 'winter', aliases: ['каток'] },
  { name: 'Сноуборд', category: 'winter', aliases: [] },
  { name: 'Скалолазание', category: 'endurance', aliases: ['скалодром', 'боулдеринг'] },
  { name: 'Фрисби', category: 'team', aliases: ['алтимат'] },
  { name: 'Настольный теннис', category: 'other', aliases: ['пинг-понг'] },
  { name: 'Падел', category: 'other', aliases: [] },
  { name: 'Бадминтон', category: 'other', aliases: [] },
];

export interface SeedOrganization {
  name: string;
  description: string;
  contacts: string;
  website?: string;
  representativeName: string;
  representativeRole: string;
  status: Extract<OrganizationStatus, 'approved' | 'pending' | 'rejected'>;
  /** Сколько дней назад профиль отправлен на проверку. */
  submittedDaysAgo: number;
  /** Сколько дней назад администратор принял решение; у заявки на рассмотрении нет. */
  decidedDaysAgo?: number;
  decisionReason?: string;
  sports: readonly string[];
}

export interface SeedAccount {
  key: DemoAccountKey;
  name: string;
  role: UserRole;
  bio?: string;
  settings?: Record<string, string>;
  /** Сколько дней назад зарегистрирован — для «На платформе с…». */
  registeredDaysAgo: number;
  interests?: readonly { sport: string; level: SkillLevel }[];
  organization?: SeedOrganization;
}

/** Демо-аккаунты быстрого входа (ТЗ 4.6), пароль у всех — `demo`. */
export const SEED_ACCOUNTS: readonly SeedAccount[] = [
  {
    key: 'anna',
    name: 'Анна',
    role: 'user',
    bio: 'Начинаю бегать, по выходным хожу на йогу',
    registeredDaysAgo: 40,
    interests: [
      { sport: 'Бег', level: 'beginner' },
      { sport: 'Йога', level: 'beginner' },
    ],
  },
  {
    key: 'igor',
    name: 'Игорь',
    role: 'user',
    bio: 'Собираю футбол по средам и вожу новичков на скалодром',
    registeredDaysAgo: 120,
    interests: [
      { sport: 'Футбол', level: 'advanced' },
      { sport: 'Скалолазание', level: 'amateur' },
      { sport: 'Бег', level: 'amateur' },
    ],
  },
  {
    key: 'petr',
    name: 'Пётр Иванович',
    role: 'user',
    bio: 'Мне 67, каждое утро делаю зарядку во дворе',
    settings: { text: 'large' },
    registeredDaysAgo: 60,
    interests: [{ sport: 'Зарядка', level: 'beginner' }],
  },
  {
    key: 'ladya',
    name: 'Шахматный клуб «Ладья»',
    role: 'org',
    registeredDaysAgo: 90,
    organization: {
      name: 'Шахматный клуб «Ладья»',
      description:
        'Шахматный клуб для взрослых и детей: блиц-турниры, разборы партий, занятия для семей',
      contacts: '+7 391 000-00-01, ladya@example.ru',
      website: 'https://example.ru/ladya',
      representativeName: 'Сергей Владимирович Котов',
      representativeRole: 'Руководитель клуба',
      status: 'approved',
      submittedDaysAgo: 85,
      decidedDaysAgo: 84,
      sports: ['Шахматы'],
    },
  },
  {
    key: 'padel',
    name: 'Падел-клуб Енисей',
    role: 'org',
    registeredDaysAgo: 3,
    organization: {
      name: 'Падел-клуб Енисей',
      description: 'Корты для падела на набережной, тренировки и игры для новичков',
      contacts: '+7 391 000-00-02',
      representativeName: 'Марина Лебедева',
      representativeRole: 'Администратор клуба',
      status: 'pending',
      submittedDaysAgo: 2,
      sports: ['Падел'],
    },
  },
  {
    key: 'stolby',
    name: 'Беговой клуб «Столбы»',
    role: 'org',
    registeredDaysAgo: 2,
    organization: {
      name: 'Беговой клуб «Столбы»',
      description: 'Беговые тренировки и трейлы у заповедника «Столбы»',
      contacts: 'stolby-run@example.ru',
      representativeName: 'Алексей Громов',
      representativeRole: 'Тренер',
      status: 'pending',
      submittedDaysAgo: 1,
      sports: ['Бег'],
    },
  },
  {
    key: 'yoga',
    name: 'Йога в парке',
    role: 'org',
    registeredDaysAgo: 10,
    organization: {
      name: 'Йога в парке',
      description: 'Йога на открытом воздухе',
      contacts: 'yoga-park@example.ru',
      representativeName: 'Ольга Светлова',
      representativeRole: 'Инструктор',
      status: 'rejected',
      submittedDaysAgo: 6,
      decidedDaysAgo: 5,
      decisionReason: 'Не указаны контакты представителя',
      sports: ['Йога'],
    },
  },
  {
    key: 'admin',
    name: 'Администратор',
    role: 'admin',
    registeredDaysAgo: 180,
  },
];

export { SEED_BACKGROUND_PEOPLE, SEED_CUSTOM_SPORT, SEED_EVENTS } from './seed-events';
export type { SeedEvent, SeedMessage, SeedPersonKey, SeedWhen } from './seed-events';
