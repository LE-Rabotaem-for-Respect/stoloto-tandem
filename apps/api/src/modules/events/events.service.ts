import { Injectable } from '@nestjs/common';
import {
  SPORT_CATEGORY_TITLES,
  calendarDayRange,
  displayStatus,
  eventMachine,
  normalizeSportName,
  todayRange,
  tomorrowRange,
  weekendRange,
} from '@tandem/domain';
import type {
  Action,
  EventDisplayStatus,
  EventLevel,
  EventMode,
  EventStatus,
  ParticipationStatus,
  SportCategory,
  TimeRange,
} from '@tandem/domain';
import { isUUID } from 'class-validator';
import { Clock } from '../../core/clock';
import { ApiError } from '../../core/errors';
import type { ErrorFields } from '../../core/errors';
import { EventBus, domainEvent } from '../../core/event-bus';
import {
  canCreateEvent,
  canManageEvent,
  canSeeParticipantInfo,
  canViewEvent,
  eventActions,
} from '../../core/policies';
import type { Actor } from '../../core/policies';
import { ParticipationsService } from '../participations/participations.service';
import { SportsService } from '../sports/sports.service';
import type { CreateEventDto, EventFeedQuery, FeedDate, UpdateEventDto } from './events.dto';
import { EventsRepository } from './events.repository';
import type { EditableFields, EventWithCard } from './events.repository';

export interface EventCard {
  id: string;
  title: string;
  description: string;
  sport: { id: string; name: string; category: SportCategory; isCustom: boolean };
  organizer: { kind: 'user' | 'organization'; id: string; name: string };
  startsAt: Date;
  endsAt: Date;
  previousStartsAt: Date | null;
  city: string;
  area: string;
  placeText: string;
  mode: EventMode;
  applyQuestion: string | null;
  level: EventLevel;
  status: EventStatus;
  statusReason: string | null;
  displayStatus: EventDisplayStatus;
  /** Запись текущего пользователя; `null` — записи нет или вошёл не пользователь. */
  participation: ParticipationStatus | null;
  /** Только подтверждённым участникам, организатору и администратору; остальным — `null`. */
  participantInfo: string | null;
  actions: Action[];
}

/** Строка ленты: только то, что помещается в карточку ленты (ТЗ 2.11). */
export interface EventFeedItem {
  id: string;
  title: string;
  sport: EventCard['sport'];
  organizer: EventCard['organizer'];
  startsAt: Date;
  endsAt: Date;
  city: string;
  area: string;
  mode: EventMode;
  level: EventLevel;
  displayStatus: EventDisplayStatus;
}

export interface EventFeed {
  items: EventFeedItem[];
  /** Сколько всего подходит под фильтры — для пагинации. */
  total: number;
  limit: number;
  offset: number;
}

const DEFAULT_FEED_LIMIT = 20;

const QUICK_DATES: Record<FeedDate, (now: Date) => TimeRange> = {
  today: todayRange,
  tomorrow: tomorrowRange,
  weekend: weekendRange,
};

const SPORT_REQUIRED = 'Выберите направление из списка или добавьте новое';

// Мероприятие со скрытым направлением показывается в группе «Другое» (ТЗ 2.3),
// а скрытое некорректное название не показывается ни в карточке, ни в ленте
function sportOf(event: EventWithCard): EventCard['sport'] {
  const hidden = event.sport.status === 'hidden';
  return {
    id: event.sport.id,
    name: hidden ? SPORT_CATEGORY_TITLES.other : event.sport.name,
    category: hidden ? 'other' : event.sport.category,
    isCustom: event.sport.isCustom,
  };
}

// Поля организатора перечислены явно: лишнее поле из выборки не уйдёт в ответ
function organizerOf(event: EventWithCard): EventCard['organizer'] {
  const { organizerOrg: org, organizerUser: user } = event;
  if (org) return { kind: 'organization', id: org.id, name: org.name };
  if (user) return { kind: 'user', id: user.id, name: user.name };
  throw new Error(`У мероприятия ${event.id} нет организатора`);
}

@Injectable()
export class EventsService {
  constructor(
    private readonly events: EventsRepository,
    private readonly sports: SportsService,
    private readonly participations: ParticipationsService,
    private readonly clock: Clock,
    private readonly bus: EventBus,
  ) {}

  /**
   * Публикует мероприятие от имени аккаунта: пользователь — от себя, организация —
   * от себя и только после допуска (ТЗ 2.6, 2.9). Новое направление создаётся в той же
   * транзакции: если мероприятие не сохранится, его не будет и в каталоге.
   */
  async create(actor: Actor, dto: CreateEventDto): Promise<EventCard> {
    const decision = canCreateEvent(actor);
    if (!decision.allowed) throw new ApiError(decision.code);
    if (actor.role !== 'user' && actor.role !== 'org') throw new ApiError('forbidden');

    const now = this.clock.now();
    const fields: ErrorFields = {};
    const publish = eventMachine.check(null, 'publish', { now, startsAt: dto.startsAt });
    if (!publish.ok) fields.startsAt = publish.error.message;
    if (dto.endsAt <= dto.startsAt) fields.endsAt = 'Окончание — позже начала';
    if (dto.mode === 'free' && dto.applyQuestion) {
      fields.applyQuestion = 'Вопрос к заявке — только для режима «По заявке»';
    }
    if (dto.sportId && dto.newSport) fields.sportId = SPORT_REQUIRED;
    if (Object.keys(fields).length > 0) throw new ApiError('validation_failed', fields);

    const organizer =
      actor.role === 'org'
        ? { organizerOrgId: actor.organization.id }
        : { organizerUserId: actor.userId };

    const id = await this.bus.afterCommit((emit) =>
      this.events.transaction(async (tx) => {
        const sport = dto.newSport
          ? await this.sports.findOrCreate(dto.newSport, actor.userId, tx)
          : await this.sports.findActive(dto.sportId ?? '', tx);
        if (!sport) throw new ApiError('validation_failed', { sportId: SPORT_REQUIRED });

        const event = await this.events.create(
          {
            ...organizer,
            sportId: sport.id,
            title: dto.title,
            description: dto.description,
            startsAt: dto.startsAt,
            endsAt: dto.endsAt,
            city: dto.city,
            area: dto.area,
            placeText: dto.placeText,
            participantInfo: dto.participantInfo ?? '',
            mode: dto.mode,
            applyQuestion: dto.mode === 'approval' ? dto.applyQuestion || null : null,
            level: dto.level,
            status: 'published',
            statusChangedAt: now,
            createdAt: now,
          },
          tx,
        );
        emit(
          domainEvent('EventCreated', {
            eventId: event.id,
            actorId: actor.userId,
            occurredAt: now,
          }),
        );
        return event.id;
      }),
    );
    return this.card(actor, id);
  }

  /**
   * Мероприятие и запись зрителя, если ему видно мероприятие (ТЗ 2.10); иначе — одинаково
   * «Мероприятие недоступно». Одно правило для карточки и обсуждения: снятое видят
   * организатор, администратор и записавшиеся.
   */
  async viewable(
    actor: Actor,
    id: string,
  ): Promise<{ event: EventWithCard; participation: ParticipationStatus | null }> {
    const event = isUUID(id) ? await this.events.findCard(id) : null;
    if (!event) throw new ApiError('event_not_available');
    const participation =
      actor.role === 'user' ? await this.events.viewerParticipation(id, actor.userId) : null;
    const view = canViewEvent(actor, event, participation);
    if (!view.allowed) throw new ApiError(view.code);
    return { event, participation };
  }

  /**
   * Изменение после публикации (ТЗ 2.2): только организатор, только опубликованное и
   * до начала. Режим записи и лимит мест проверяет модуль участия — он же блокирует
   * строку мероприятия до конца транзакции (DECISION-002, «Лимит мест»): запись, которая
   * идёт в это же время, дождётся изменения или пройдёт до него. После коммита —
   * `EventUpdated` со списком изменённых полей; если ничего не изменилось — без события.
   */
  async update(actor: Actor, id: string, dto: UpdateEventDto): Promise<EventCard> {
    await this.bus.afterCommit((emit) =>
      this.events.transaction(async (tx) => {
        const locked = await this.participations.lockForTermsChange(
          id,
          { mode: dto.mode, capacity: dto.capacity },
          tx,
        );
        if (!locked) throw new ApiError('event_not_available');
        const { event } = locked;
        // Кому мероприятие не видно, тот не узнаёт и о нём: тот же ответ, что у карточки
        const view = canViewEvent(actor, event, null);
        if (!view.allowed) throw new ApiError(view.code);
        const manage = canManageEvent(actor, event);
        if (!manage.allowed) throw new ApiError(manage.code);
        const now = this.clock.now();
        eventMachine.nextState(event.status, 'edit', { now, startsAt: event.startsAt });

        const fields: ErrorFields = { ...locked.fields };
        const mode = dto.mode ?? event.mode;
        // Вопрос к заявке остаётся только у режима «По заявке» (как при создании)
        if (mode === 'free' && dto.applyQuestion) {
          fields.applyQuestion = 'Вопрос к заявке — только для режима «По заявке»';
        }
        if (Object.keys(fields).length > 0) throw new ApiError('validation_failed', fields);

        const current = await this.events.findEditable(event.id, tx);
        const next: EditableFields = {
          title: dto.title,
          description: dto.description,
          city: dto.city,
          area: dto.area,
          placeText: dto.placeText,
          participantInfo: dto.participantInfo,
          level: dto.level,
          mode: dto.mode,
          capacity: dto.capacity,
          applyQuestion:
            mode === 'free'
              ? null
              : dto.applyQuestion === undefined
                ? undefined
                : dto.applyQuestion || null,
        };
        const changed = (Object.keys(next) as (keyof EditableFields)[]).filter(
          (field) => next[field] !== undefined && next[field] !== current[field],
        );
        if (changed.length === 0) return;

        await this.events.update(event.id, next, tx);
        emit(
          domainEvent('EventUpdated', {
            eventId: event.id,
            fields: changed,
            actorId: actor.role === 'guest' ? null : actor.userId,
            occurredAt: now,
          }),
        );
      }),
    );
    return this.card(actor, id);
  }

  /**
   * Карточка мероприятия (ТЗ 2.2): статус для показа, организатор, запись текущего
   * пользователя и `actions[]` из тех же политик, что проверяют действия.
   * Недоступное этому пользователю и несуществующее — одинаково «Мероприятие недоступно».
   */
  async card(actor: Actor, id: string): Promise<EventCard> {
    const { event, participation } = await this.viewable(actor, id);

    const now = this.clock.now();
    const confirmedCount = await this.events.confirmedCount(id);
    const hasSeats = event.capacity === null || confirmedCount < event.capacity;
    const seesInfo = canSeeParticipantInfo(actor, event, participation).allowed;

    return {
      id: event.id,
      title: event.title,
      description: event.description,
      sport: sportOf(event),
      organizer: organizerOf(event),
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      previousStartsAt: event.previousStartsAt,
      city: event.city,
      area: event.area,
      placeText: event.placeText,
      mode: event.mode,
      applyQuestion: event.applyQuestion,
      level: event.level,
      status: event.status,
      statusReason: event.statusReason,
      displayStatus: displayStatus(event, now, confirmedCount),
      participation,
      participantInfo: seesInfo ? event.participantInfo : null,
      actions: eventActions(actor, { ...event, hasSeats }, participation, now),
    };
  }

  /**
   * Лента и поиск (ТЗ 2.8): только опубликованные и не завершённые, по дате начала.
   * Даты «Сегодня», «Завтра», «Выходные» и диапазон считаются по Красноярску;
   * уровень «Новичок» находит и события «Любой».
   */
  async feed(query: EventFeedQuery): Promise<EventFeed> {
    const now = this.clock.now();
    const range = this.startsRange(query, now);
    const limit = query.limit ?? DEFAULT_FEED_LIMIT;
    const offset = query.offset ?? 0;
    const text = query.q || undefined;

    const { events, total } = await this.events.feed(
      {
        now,
        text,
        sportText: text && normalizeSportName(text),
        sportId: query.sport,
        category: query.category,
        startsFrom: range?.from,
        startsBefore: range?.to,
        city: query.city || undefined,
        area: query.area || undefined,
        levels: query.level && (query.level === 'any' ? ['any'] : [query.level, 'any']),
        mode: query.mode,
      },
      { offset, limit },
    );
    const confirmed = await this.events.confirmedCounts(events.map((event) => event.id));

    return {
      items: events.map((event) => ({
        id: event.id,
        title: event.title,
        sport: sportOf(event),
        organizer: organizerOf(event),
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        city: event.city,
        area: event.area,
        mode: event.mode,
        level: event.level,
        displayStatus: displayStatus(event, now, confirmed.get(event.id) ?? 0),
      })),
      total,
      limit,
      offset,
    };
  }

  private startsRange(query: EventFeedQuery, now: Date): Partial<TimeRange> | undefined {
    const fields: ErrorFields = {};
    if (query.date && (query.from || query.to)) {
      fields.date = 'Выберите что-то одно: быстрый выбор даты или диапазон';
    }
    const from = query.from ? calendarDayRange(query.from) : undefined;
    const to = query.to ? calendarDayRange(query.to) : undefined;
    if (from === null) fields.from = 'Такой даты нет';
    if (to === null) fields.to = 'Такой даты нет';
    if (from && to && to.to <= from.from) fields.to = 'Дата «по» — не раньше даты «с»';
    if (Object.keys(fields).length > 0) throw new ApiError('validation_failed', fields);

    if (query.date) return QUICK_DATES[query.date](now);
    return { from: from?.from, to: to?.to };
  }
}
