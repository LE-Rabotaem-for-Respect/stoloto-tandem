import type { DemoAccountKey } from '@tandem/domain';
import type { EventLevel, SportCategory } from '../../generated/prisma/client';

/** Фоновые участники (ТЗ 4.6): входят по почте `<ключ>@demo`, в быстрый вход не выносятся. */
export const SEED_BACKGROUND_PEOPLE = [
  { key: 'maria', name: 'Мария', registeredDaysAgo: 75 },
  { key: 'dmitry', name: 'Дмитрий', registeredDaysAgo: 110 },
  { key: 'olga', name: 'Ольга', registeredDaysAgo: 95 },
  { key: 'sergey', name: 'Сергей', registeredDaysAgo: 50 },
  { key: 'elena', name: 'Елена', registeredDaysAgo: 140 },
  { key: 'kirill', name: 'Кирилл', registeredDaysAgo: 30 },
  { key: 'natalya', name: 'Наталья', registeredDaysAgo: 65 },
  { key: 'artem', name: 'Артём', registeredDaysAgo: 20 },
  { key: 'ksenia', name: 'Ксения', registeredDaysAgo: 45 },
  { key: 'pavel', name: 'Павел', registeredDaysAgo: 85 },
] as const;

export type SeedPersonKey = DemoAccountKey | (typeof SEED_BACKGROUND_PEOPLE)[number]['key'];

/** Пользовательское направление: «Петанк» добавил Сергей, в стартовом каталоге его нет. */
export const SEED_CUSTOM_SPORT: {
  name: string;
  category: SportCategory;
  createdBy: SeedPersonKey;
} = { name: 'Петанк', category: 'other', createdBy: 'sergey' };

/** Когда: календарный день от сегодня или ближайший из дней недели (0 — воскресенье). */
export type SeedWhen =
  | { days: number; from: string; to: string }
  | { weekdays: readonly number[]; from: string; to: string };

export interface SeedMessage {
  author: SeedPersonKey;
  text: string;
  /** Ответ организатора; у организации — от её имени. */
  reply: string;
}

export interface SeedEvent {
  title: string;
  sport: string;
  organizer: { user: SeedPersonKey } | { org: 'ladya' };
  when: SeedWhen;
  description: string;
  area: string;
  placeText: string;
  mode: 'free' | 'approval';
  capacity?: number;
  applyQuestion?: string;
  level: EventLevel;
  firstTimersOk?: boolean;
  price: number;
  howItGoes?: string;
  participantInfo?: string;
  /** Подтверждённые участники. */
  participants: readonly SeedPersonKey[];
  /** Заявки на рассмотрении с ответом на вопрос организатора. */
  requests: readonly { person: SeedPersonKey; answer: string }[];
  messages: readonly SeedMessage[];
  /** Снято с публикации модератором — с этой причиной. */
  unpublishedReason?: string;
}

/** Демо-мероприятия (ТЗ 4.6): составы, заявки и даты — как в docs/scenarios.md. */
export const SEED_EVENTS: readonly SeedEvent[] = [
  {
    title: 'Футбол 7×7 по средам',
    sport: 'Футбол',
    organizer: { user: 'igor' },
    when: { weekdays: [3], from: '19:00', to: '20:30' },
    description: 'Играем 7 на 7 по средам, команды делим на месте. Нужны все позиции',
    area: 'Октябрьский район',
    placeText: 'Стадион «Локомотив», малое поле',
    mode: 'approval',
    capacity: 14,
    applyQuestion: 'На какой позиции играете?',
    level: 'amateur',
    price: 300,
    howItGoes: 'Оплата на месте',
    participantInfo: 'Поле с искусственным газоном, раздевалка открыта с 18:30',
    participants: ['maria', 'olga', 'elena', 'kirill', 'natalya', 'ksenia', 'pavel', 'petr'],
    requests: [
      { person: 'dmitry', answer: 'Защитник' },
      { person: 'sergey', answer: 'Вратарь' },
      { person: 'artem', answer: 'Где нужно' },
    ],
    messages: [
      {
        author: 'dmitry',
        text: 'Нужны бутсы или можно в кроссовках?',
        reply: 'Газон искусственный, подойдут многошиповки или кроссовки',
      },
    ],
  },
  {
    title: 'Блиц-турнир в клубе «Ладья»',
    sport: 'Шахматы',
    organizer: { org: 'ladya' },
    when: { weekdays: [6], from: '12:00', to: '15:00' },
    description: 'Блиц 5+3 по швейцарской системе, девять туров. Рейтинг не нужен',
    area: 'Центральный район',
    placeText: 'Шахматный клуб «Ладья», ул. Карла Маркса, 48',
    mode: 'free',
    capacity: 16,
    level: 'any',
    price: 0,
    participantInfo: 'Клуб «Ладья», второй этаж, зал 2. Назовите на входе фамилию — вы в списке',
    participants: ['maria', 'pavel'],
    requests: [],
    messages: [
      { author: 'pavel', text: 'Часы и доски свои приносить?', reply: 'Всё есть в клубе' },
    ],
  },
  {
    title: 'Шахматы для детей и родителей',
    sport: 'Шахматы',
    organizer: { org: 'ladya' },
    when: { weekdays: [0], from: '11:00', to: '12:30' },
    description: 'Занятие для ребёнка вместе с родителем: правила, первые комбинации, партия',
    area: 'Центральный район',
    placeText: 'Шахматный клуб «Ладья», ул. Карла Маркса, 48',
    mode: 'approval',
    capacity: 10,
    applyQuestion: 'Сколько лет ребёнку?',
    level: 'beginner',
    price: 0,
    participants: [],
    requests: [
      { person: 'elena', answer: '7 лет' },
      { person: 'natalya', answer: '9 лет' },
    ],
    messages: [],
  },
  {
    title: 'Пробежка 5 км на острове Татышев',
    sport: 'Бег',
    organizer: { user: 'olga' },
    when: { days: 2, from: '08:00', to: '09:00' },
    description: 'Спокойные 5 км вокруг острова в разговорном темпе',
    area: 'Центральный район',
    placeText: 'Остров Татышев, центральный вход',
    mode: 'free',
    capacity: 6,
    level: 'beginner',
    firstTimersOk: true,
    price: 0,
    participantInfo: 'Сбор у центрального входа на остров Татышев, ищите оранжевый флаг',
    participants: ['igor', 'maria', 'kirill', 'ksenia', 'dmitry', 'elena'],
    requests: [],
    messages: [
      { author: 'maria', text: 'Какой темп?', reply: 'Около 6:30 на километр, никого не бросаем' },
    ],
  },
  {
    title: 'Зарядка во дворе',
    sport: 'Зарядка',
    organizer: { user: 'petr' },
    when: { weekdays: [2, 4], from: '07:30', to: '08:00' },
    description: 'Полчаса простой зарядки на свежем воздухе, подойдёт в любом возрасте',
    area: 'Советский район',
    placeText: 'Двор дома на ул. Весны, 7, у спортивной площадки',
    mode: 'free',
    level: 'any',
    firstTimersOk: true,
    price: 0,
    participants: ['natalya', 'sergey'],
    requests: [],
    messages: [],
  },
  {
    title: 'Скалолазание для начинающих',
    sport: 'Скалолазание',
    organizer: { user: 'igor' },
    when: { days: 3, from: '18:30', to: '20:30' },
    description: 'Первое занятие на скалодроме с инструктажем и страховкой',
    area: 'Свердловский район',
    placeText: 'Скалодром «Вертикаль», ул. Свердловская, 15',
    mode: 'approval',
    capacity: 8,
    applyQuestion: 'Ваш опыт?',
    level: 'beginner',
    firstTimersOk: true,
    price: 600,
    howItGoes: 'Оплата на месте, в стоимость входит прокат снаряжения',
    participantInfo:
      'Встречаемся у стойки администратора скалодрома за 15 минут до начала, обувь выдадут',
    participants: [],
    requests: [
      { person: 'ksenia', answer: 'Хочу прийти с сыном, ему 10 лет' },
      { person: 'artem', answer: 'Полгода лазаю на скалодроме' },
    ],
    messages: [],
  },
  {
    title: 'Петанк на набережной',
    sport: 'Петанк',
    organizer: { user: 'sergey' },
    when: { days: 1, from: '17:00', to: '19:00' },
    description: 'Играем в петанк на гравийной площадке, шары есть на всех',
    area: 'Центральный район',
    placeText: 'Набережная Енисея, площадка у Коммунального моста',
    mode: 'free',
    level: 'any',
    price: 0,
    participants: ['pavel'],
    requests: [],
    messages: [],
  },
  {
    title: 'Фрисби в парке Гагарина',
    sport: 'Фрисби',
    organizer: { user: 'kirill' },
    when: { days: 4, from: '17:00', to: '19:00' },
    description: 'Пасы и игра в алтимат на поляне, диски есть',
    area: 'Железнодорожный район',
    placeText: 'Парк Гагарина, большая поляна',
    mode: 'free',
    capacity: 12,
    level: 'amateur',
    price: 0,
    participants: ['artem'],
    requests: [],
    messages: [],
  },
  {
    title: 'Волейбол на песке',
    sport: 'Волейбол',
    organizer: { user: 'dmitry' },
    when: { days: 5, from: '18:00', to: '20:00' },
    description: 'Пляжный волейбол 2 на 2 и 4 на 4',
    area: 'Октябрьский район',
    placeText: 'Пляжные площадки на Татышеве',
    mode: 'free',
    level: 'amateur',
    price: 0,
    participants: ['anna', 'kirill'],
    requests: [],
    messages: [],
    unpublishedReason: 'Площадка закрыта на ремонт',
  },
  {
    title: 'Йога на рассвете',
    sport: 'Йога',
    organizer: { user: 'elena' },
    when: { days: -12, from: '05:30', to: '06:30' },
    description: 'Мягкая практика на рассвете, коврики берите свои',
    area: 'Центральный район',
    placeText: 'Центральный парк, у фонтана',
    mode: 'free',
    level: 'any',
    firstTimersOk: true,
    price: 0,
    participants: ['anna', 'maria'],
    requests: [],
    messages: [],
  },
];
