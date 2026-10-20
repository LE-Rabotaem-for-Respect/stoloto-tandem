import { Module } from '@nestjs/common';
import { ParticipationsModule } from '../participations/participations.module';
import { SportsModule } from '../sports/sports.module';
import { EventsController } from './events.controller';
import { EventsRepository } from './events.repository';
import { EventsService } from './events.service';

/** Мероприятия: создание и карточка (ТЗ 2.2). */
@Module({
  imports: [SportsModule, ParticipationsModule],
  controllers: [EventsController],
  providers: [EventsRepository, EventsService],
  exports: [EventsService],
})
export class EventsModule {}
