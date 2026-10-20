import { Injectable } from '@nestjs/common';
import { MESSAGE_STATUS_VIEW, messageMachine } from '@tandem/domain';
import type { Action, MessageStatus } from '@tandem/domain';
import { isUUID } from 'class-validator';
import { Clock } from '../../core/clock';
import { ApiError } from '../../core/errors';
import { EventBus, domainEvent } from '../../core/event-bus';
import { canEditMessage, canModerate, canPostMessage, toAction } from '../../core/policies';
import type { Actor, PolicyEvent } from '../../core/policies';
import { EventsService } from '../events/events.service';
import type { CreateMessageDto, EditMessageDto, ModerateMessageDto } from './messages.dto';
import { MessagesRepository } from './messages.repository';
import type { MessageRecord } from './messages.repository';

/** То, что обсуждению нужно знать о мероприятии. */
type DiscussionEvent = PolicyEvent & { id: string };

export interface MessageView {
  id: string;
  parentId: string | null;
  /** Сообщение организации подписано её названием (ТЗ 2.7). */
  author: { kind: 'user' | 'organization'; id: string; name: string };
  /** Метка «Организатор» — сообщение от организатора мероприятия. */
  isOrganizer: boolean;
  /** Текст только у видимого сообщения; у скрытого и удалённого — заглушка в `placeholder`. */
  text: string | null;
  placeholder: string | null;
  status: MessageStatus;
  /** Причину скрытия видит только автор. */
  moderationReason: string | null;
  createdAt: Date;
  editedAt: Date | null;
  edited: boolean;
  actions: Action[];
}

/** Скрытое сообщение в админке: текст виден администратору. */
export interface AdminMessageItem {
  id: string;
  eventId: string;
  eventTitle: string;
  author: { kind: 'user' | 'organization'; id: string; name: string };
  text: string;
  moderationReason: string | null;
  createdAt: Date;
  /** Что администратор может сделать дальше: скрытое — только удалить. */
  actions: Action[];
}

export interface ThreadView extends MessageView {
  replies: MessageView[];
}

// Единственное правило «от организатора»: метка в обсуждении и уведомления о вопросах и ответах
function isFromOrganizer(
  event: Pick<PolicyEvent, 'organizerUserId' | 'organizerOrgId'>,
  message: Pick<MessageRecord, 'asOrganizationId' | 'authorUserId'>,
): boolean {
  if (event.organizerOrgId) return message.asOrganizationId === event.organizerOrgId;
  return message.asOrganizationId === null && message.authorUserId === event.organizerUserId;
}

// Администратору — «Скрыть» видимое и «Удалить» видимое или скрытое (автомат сообщения);
// удалённое не восстанавливается
function moderationActions(actor: Actor, status: MessageStatus): Action[] {
  if (!canModerate(actor).allowed) return [];
  const actions: Action[] = [];
  if (messageMachine.canTransition(status, 'hide', { reason: 'в форме' })) {
    actions.push({ code: 'hide_message', enabled: true });
  }
  if (messageMachine.canTransition(status, 'delete_by_moderator', { reason: 'в форме' })) {
    actions.push({ code: 'delete_message', enabled: true });
  }
  return actions;
}

/**
 * Обсуждение мероприятия (ТЗ 2.7): читают все, кому видна карточка, пишет вошедший
 * пользователь и допущенная организация; ответ — один уровень вложенности.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly messages: MessagesRepository,
    private readonly events: EventsService,
    private readonly clock: Clock,
    private readonly bus: EventBus,
  ) {}

  /**
   * Скрытые модератором сообщения для администратора (ТЗ 2.10): текст, причина,
   * автор и мероприятие. Посторонним текст скрытого не виден — только здесь.
   */
  async adminHidden(
    actor: Actor,
    page: { limit: number; offset: number },
  ): Promise<{ items: AdminMessageItem[]; total: number; limit: number; offset: number }> {
    const decision = canModerate(actor);
    if (!decision.allowed) throw new ApiError(decision.code);
    const { messages, total } = await this.messages.listByStatus('hidden_by_moderator', page);
    const titles = await this.events.titles([...new Set(messages.map((m) => m.eventId))]);
    return {
      items: messages.map((message) => ({
        id: message.id,
        eventId: message.eventId,
        eventTitle: titles.get(message.eventId) ?? '',
        author: message.asOrganization
          ? {
              kind: 'organization',
              id: message.asOrganization.id,
              name: message.asOrganization.name,
            }
          : { kind: 'user', id: message.author.id, name: message.author.name },
        text: message.text,
        moderationReason: message.moderationReason,
        createdAt: message.createdAt,
        actions: moderationActions(actor, message.status),
      })),
      total,
      ...page,
    };
  }

  /** Сообщения, скрытые модератором (обзор админки). */
  countHidden(): Promise<number> {
    return this.messages.countByStatus('hidden_by_moderator');
  }

  /** Кто написал сообщение и на чьё оно ответ (уведомления о вопросах и ответах, ТЗ 3.3). */
  async authorship(id: string): Promise<{
    /** От организатора мероприятия — по тому же правилу, что метка «Организатор». */
    fromOrganizer: boolean;
    parentAuthorUserId: string | null;
  } | null> {
    const message = await this.messages.find(id);
    if (!message) return null;
    const [event, parent] = await Promise.all([
      this.events.organizerOf(message.eventId),
      message.parentId ? this.messages.find(message.parentId) : null,
    ]);
    if (!event) return null;
    return {
      fromOrganizer: isFromOrganizer(event, message),
      parentAuthorUserId: parent?.authorUserId ?? null,
    };
  }

  async list(actor: Actor, eventId: string): Promise<ThreadView[]> {
    const event = await this.visibleEvent(actor, eventId);
    const views = (await this.messages.list(event.id)).map((message) =>
      this.view(actor, event, message),
    );
    const threads = views
      .filter((message) => message.parentId === null)
      .map((message): ThreadView => ({ ...message, replies: [] }));
    const byId = new Map(threads.map((thread) => [thread.id, thread]));
    for (const reply of views) {
      if (reply.parentId) byId.get(reply.parentId)?.replies.push(reply);
    }
    return threads;
  }

  async post(actor: Actor, eventId: string, dto: CreateMessageDto): Promise<MessageView> {
    const event = await this.visibleEvent(actor, eventId);
    const decision = canPostMessage(actor, event);
    if (!decision.allowed) throw new ApiError(decision.code);
    if (actor.role !== 'user' && actor.role !== 'org') throw new ApiError('forbidden');

    if (dto.parentId) {
      const parent = await this.messages.find(dto.parentId);
      if (!parent || parent.eventId !== event.id) {
        throw new ApiError('validation_failed', {
          parentId: 'Ответить можно только на сообщение этого обсуждения',
        });
      }
      if (parent.parentId !== null) {
        throw new ApiError('validation_failed', {
          parentId: 'Ответить можно только на сообщение верхнего уровня',
        });
      }
      if (parent.status !== 'visible') {
        throw new ApiError('validation_failed', {
          parentId: 'Сообщение скрыто или удалено — ответить на него нельзя',
        });
      }
    }

    const now = this.clock.now();
    const message = await this.bus.afterCommit(async (emit) => {
      const created = await this.messages.create({
        eventId: event.id,
        authorUserId: actor.userId,
        asOrganizationId: actor.role === 'org' ? actor.organization.id : null,
        parentId: dto.parentId ?? null,
        text: dto.text,
        createdAt: now,
      });
      emit(
        domainEvent('MessagePosted', {
          messageId: created.id,
          eventId: event.id,
          authorId: actor.userId,
          actorId: actor.userId,
          occurredAt: now,
        }),
      );
      return created;
    });
    return this.view(actor, event, message);
  }

  /** Правка своего видимого сообщения: остаётся признак «изменено» (ТЗ 2.7). */
  async edit(
    actor: Actor,
    eventId: string,
    messageId: string,
    dto: EditMessageDto,
  ): Promise<MessageView> {
    const { event, message } = await this.ownMessage(actor, eventId, messageId);
    if (message.status !== 'visible') {
      throw new ApiError(
        'invalid_transition',
        undefined,
        'Изменить можно только видимое сообщение',
      );
    }
    const updated = await this.messages.update(message.id, 'visible', {
      text: dto.text,
      editedAt: this.clock.now(),
    });
    if (!updated) throw new ApiError('conflict');
    return this.view(actor, event, updated);
  }

  /** Удаление автором: остаётся заглушка, ответы сохраняются (ТЗ 2.7). */
  async remove(actor: Actor, eventId: string, messageId: string): Promise<MessageView> {
    const { event, message, userId } = await this.ownMessage(actor, eventId, messageId);
    const status = messageMachine.nextState(message.status, 'delete_by_author', {});
    const now = this.clock.now();
    const updated = await this.bus.afterCommit(async (emit) => {
      const result = await this.messages.update(message.id, message.status, { status });
      if (!result) throw new ApiError('conflict');
      emit(
        domainEvent('MessageDeleted', {
          messageId: message.id,
          eventId: event.id,
          by: 'author',
          actorId: userId,
          occurredAt: now,
        }),
      );
      return result;
    });
    return this.view(actor, event, updated);
  }

  /**
   * Модерация (ТЗ 2.7, 2.10): «Скрыть» — заглушка «Скрыто модератором», автор видит
   * причину; «Удалить» — заглушка «Удалено модератором», без восстановления. Мероприятие и
   * остальное обсуждение, в том числе ответы, сохраняются. Переход — по автомату сообщения.
   */
  async moderate(
    actor: Actor,
    eventId: string,
    messageId: string,
    dto: ModerateMessageDto,
  ): Promise<MessageView> {
    const decision = canModerate(actor);
    if (!decision.allowed) throw new ApiError(decision.code);
    const event = await this.visibleEvent(actor, eventId);
    const message = isUUID(messageId) ? await this.messages.find(messageId) : null;
    if (!message || message.eventId !== event.id) throw new ApiError('not_found');
    const status = messageMachine.nextState(
      message.status,
      dto.action === 'hide' ? 'hide' : 'delete_by_moderator',
      { reason: dto.reason },
    );
    const now = this.clock.now();
    const actorId = actor.role === 'guest' ? null : actor.userId;
    const updated = await this.bus.afterCommit(async (emit) => {
      const result = await this.messages.update(message.id, message.status, {
        status,
        moderationReason: dto.reason,
      });
      if (!result) throw new ApiError('conflict');
      emit(
        dto.action === 'hide'
          ? domainEvent('MessageHidden', {
              messageId: message.id,
              eventId: event.id,
              reason: dto.reason,
              actorId,
              occurredAt: now,
            })
          : domainEvent('MessageDeleted', {
              messageId: message.id,
              eventId: event.id,
              by: 'moderator',
              reason: dto.reason,
              actorId,
              occurredAt: now,
            }),
      );
      return result;
    });
    return this.view(actor, event, updated);
  }

  // Обсуждение видят те же, кому видна карточка: правило одно — в EventsService (ТЗ 2.10)
  private async visibleEvent(actor: Actor, eventId: string): Promise<DiscussionEvent> {
    return (await this.events.viewable(actor, eventId)).event;
  }

  private async ownMessage(actor: Actor, eventId: string, messageId: string) {
    const event = await this.visibleEvent(actor, eventId);
    const message = isUUID(messageId) ? await this.messages.find(messageId) : null;
    if (!message || message.eventId !== event.id) throw new ApiError('not_found');
    const decision = canEditMessage(actor, event, message);
    if (!decision.allowed) throw new ApiError(decision.code);
    if (actor.role === 'guest') throw new ApiError('unauthorized');
    return { event, message, userId: actor.userId };
  }

  private view(actor: Actor, event: DiscussionEvent, message: MessageRecord): MessageView {
    const visible = message.status === 'visible';
    const isAuthor = actor.role !== 'guest' && message.authorUserId === actor.userId;
    const ownActions = visible && isAuthor;
    const edit = canEditMessage(actor, event, message);
    return {
      id: message.id,
      parentId: message.parentId,
      author: message.asOrganization
        ? { kind: 'organization', id: message.asOrganization.id, name: message.asOrganization.name }
        : { kind: 'user', id: message.author.id, name: message.author.name },
      isOrganizer: isFromOrganizer(event, message),
      text: visible ? message.text : null,
      placeholder: visible ? null : MESSAGE_STATUS_VIEW[message.status].text,
      status: message.status,
      moderationReason:
        isAuthor && message.status === 'hidden_by_moderator' ? message.moderationReason : null,
      createdAt: message.createdAt,
      editedAt: visible ? message.editedAt : null,
      edited: visible && message.editedAt !== null,
      actions: ownActions
        ? [toAction('edit_message', edit), toAction('delete_message', edit)]
        : moderationActions(actor, message.status),
    };
  }
}
