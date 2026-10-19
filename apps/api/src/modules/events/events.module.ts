import { Module } from '@nestjs/common';
import { SportsModule } from '../sports/sports.module';
import { EventsController } from './events.controller';
import { EventsRepository } from './events.repository';
import { EventsService } from './events.service';

/** Мероприятия: создание и карточка (ТЗ 2.2). */
@Module({
  imports: [SportsModule],
  controllers: [EventsController],
  providers: [EventsRepository, EventsService],
  exports: [EventsService],
})
export class EventsModule {}
