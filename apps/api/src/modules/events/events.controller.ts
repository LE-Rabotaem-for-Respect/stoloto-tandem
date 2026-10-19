import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { Actor } from '../../core/policies';
import { CurrentActor, Public } from '../auth';
import { CreateEventDto } from './events.dto';
import { EventsService } from './events.service';
import type { EventCard } from './events.service';

// Создание требует входа (маршрут без метки закрыт для гостя). Какой вошедший может
// создать мероприятие, решает политика в сервисе: администратор и недопущенная
// организация получают её точные отказы. Форму целиком проверяет ValidationPipe
// до сервиса: с неверным телом ответ — 400
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  create(@CurrentActor() actor: Actor, @Body() dto: CreateEventDto): Promise<EventCard> {
    return this.events.create(actor, dto);
  }

  // Гость видит карточки опубликованных событий (ТЗ 2.6); что ещё ему видно — решает canViewEvent
  @Public()
  @Get(':id')
  card(@CurrentActor() actor: Actor, @Param('id') id: string): Promise<EventCard> {
    return this.events.card(actor, id);
  }
}
