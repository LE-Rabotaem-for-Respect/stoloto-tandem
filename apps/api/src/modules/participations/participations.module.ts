import { Module } from '@nestjs/common';
import {
  ParticipationDecisionsController,
  ParticipationsController,
} from './participations.controller';
import { ParticipationsRepository } from './participations.repository';
import { ParticipationsService } from './participations.service';

/** Запись на мероприятия: запись, заявка, отмена, решения организатора (ТЗ 2.4, 2.5). */
@Module({
  controllers: [ParticipationsController, ParticipationDecisionsController],
  providers: [ParticipationsRepository, ParticipationsService],
  exports: [ParticipationsService],
})
export class ParticipationsModule {}
