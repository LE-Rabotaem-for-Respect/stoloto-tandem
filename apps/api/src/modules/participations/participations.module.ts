import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import {
  MyParticipationsController,
  ParticipationDecisionsController,
  ParticipationsController,
} from './participations.controller';
import { ParticipationsRepository } from './participations.repository';
import { ParticipationsService } from './participations.service';

/** Запись на мероприятия: запись, заявка, отмена, решения организатора, «Мои записи» (ТЗ 2.4, 2.5). */
@Module({
  imports: [EventsModule],
  controllers: [
    ParticipationsController,
    ParticipationDecisionsController,
    MyParticipationsController,
  ],
  providers: [ParticipationsRepository, ParticipationsService],
  exports: [ParticipationsService],
})
export class ParticipationsModule {}
