import { Module } from '@nestjs/common';
import { EventTermsService } from './event-terms.service';
import { ParticipationsRepository } from './participations.repository';

/** Режим записи и лимит мест для изменения мероприятия — без зависимости от модуля мероприятий. */
@Module({
  providers: [ParticipationsRepository, EventTermsService],
  exports: [EventTermsService],
})
export class EventTermsModule {}
