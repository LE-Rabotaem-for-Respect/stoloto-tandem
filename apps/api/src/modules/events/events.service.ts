import { Injectable } from '@nestjs/common';
import { SPORT_CATEGORY_TITLES, displayStatus, eventMachine } from '@tandem/domain';
import type {
  Action,
  EventDisplayStatus,
  EventLevel,
  EventMode,
  EventStatus,
  ParticipationStatus,
  SportCategory,
} from '@tandem/domain';
import { isUUID } from 'class-validator';
import { Clock } from '../../core/clock';
import { ApiError } from '../../core/errors';
import type { ErrorFields } from '../../core/errors';
import { EventBus, domainEvent } from '../../core/event-bus';
import {
  canCreateEvent,
  canSeeParticipantInfo,
  canViewEvent,
  eventActions,
} from '../../core/policies';
import type { Actor } from '../../core/policies';
import { SportsService } from '../sports/sports.service';
import type { CreateEventDto } from './events.dto';
import { EventsRepository } from './events.repository';
import type { EventWithCard } from './events.repository';

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

const SPORT_REQUIRED = 'Выберите направление из списка или добавьте новое';

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
   * Карточка мероприятия (ТЗ 2.2): статус для показа, организатор, запись текущего
   * пользователя и `actions[]` из тех же политик, что проверяют действия.
   * Недоступное этому пользователю и несуществующее — одинаково «Мероприятие недоступно».
   */
  async card(actor: Actor, id: string): Promise<EventCard> {
    const event = isUUID(id) ? await this.events.findCard(id) : null;
    if (!event) throw new ApiError('event_not_available');

    const participation =
      actor.role === 'user' ? await this.events.viewerParticipation(id, actor.userId) : null;
    const view = canViewEvent(actor, event, participation);
    if (!view.allowed) throw new ApiError(view.code);

    const now = this.clock.now();
    const confirmedCount = await this.events.confirmedCount(id);
    const hasSeats = event.capacity === null || confirmedCount < event.capacity;
    const seesInfo = canSeeParticipantInfo(actor, event, participation).allowed;
    const hidden = event.sport.status === 'hidden';

    return {
      id: event.id,
      title: event.title,
      description: event.description,
      sport: {
        id: event.sport.id,
        // Мероприятие со скрытым направлением показывается в группе «Другое» (ТЗ 2.3),
        // а скрытое некорректное название не показывается и в самой карточке
        name: hidden ? SPORT_CATEGORY_TITLES.other : event.sport.name,
        category: hidden ? 'other' : event.sport.category,
        isCustom: event.sport.isCustom,
      },
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
}
