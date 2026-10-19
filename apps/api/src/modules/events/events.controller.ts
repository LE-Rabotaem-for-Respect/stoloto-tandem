import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { Actor } from '../../core/policies';
import { CurrentActor } from '../auth';
import { CreateEventDto } from './events.dto';
import { EventsService } from './events.service';
import type { EventCard } from './events.service';

// Кто может создать мероприятие, решает политика в сервисе, а не декоратор маршрута:
// так гость, администратор и недопущенная организация получают её точные отказы.
// Форму целиком проверяет ValidationPipe до сервиса: с неверным телом ответ — 400
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  create(@CurrentActor() actor: Actor, @Body() dto: CreateEventDto): Promise<EventCard> {
    return this.events.create(actor, dto);
  }

  @Get(':id')
  card(@CurrentActor() actor: Actor, @Param('id') id: string): Promise<EventCard> {
    return this.events.card(actor, id);
  }
}
