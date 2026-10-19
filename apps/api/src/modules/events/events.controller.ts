import { Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import type { Actor } from '../../core/policies';
import { CurrentActor, Public, SignedIn } from '../auth';
import { CreateEventDto, EventFeedQuery } from './events.dto';
import { EventsService } from './events.service';
import type { EventCard, EventFeed } from './events.service';

// Создание требует входа (метка на методе — как у каждого изменяющего маршрута). Какой вошедший может
// создать мероприятие, решает политика в сервисе: администратор и недопущенная
// организация получают её точные отказы. Форму целиком проверяет ValidationPipe
// до сервиса: с неверным телом ответ — 400
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @SignedIn()
  @Post()
  create(@CurrentActor() actor: Actor, @Body() dto: CreateEventDto): Promise<EventCard> {
    return this.events.create(actor, dto);
  }

  // Ленту и поиск видит и гость (ТЗ 2.6)
  @Public()
  @Get()
  feed(@Query() query: EventFeedQuery): Promise<EventFeed> {
    return this.events.feed(query);
  }

  // Гость видит карточки опубликованных событий (ТЗ 2.6); что ещё ему видно — решает canViewEvent.
  // Ответ зависит от того, кто смотрит («Информация для участников»): кешировать его нельзя
  @Public()
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  card(@CurrentActor() actor: Actor, @Param('id') id: string): Promise<EventCard> {
    return this.events.card(actor, id);
  }
}
