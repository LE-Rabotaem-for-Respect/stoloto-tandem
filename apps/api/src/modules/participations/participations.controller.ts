import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import type { Actor } from '../../core/policies';
import { CurrentActor, SignedIn } from '../auth';
import { JoinDto } from './participations.dto';
import { ParticipationsService } from './participations.service';
import type { ParticipationView } from './participations.service';

// Записаться и отменить запись — только вошедшему (метки на методах). Кто из вошедших
// может, решают политика и автомат записи в сервисе
@Controller('events')
export class ParticipationsController {
  constructor(private readonly participations: ParticipationsService) {}

  @SignedIn()
  @Post(':id/join')
  join(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() dto: JoinDto,
  ): Promise<ParticipationView> {
    return this.participations.join(actor, id, dto.answer);
  }

  @SignedIn()
  @HttpCode(200)
  @Post(':id/leave')
  leave(@CurrentActor() actor: Actor, @Param('id') id: string): Promise<ParticipationView> {
    return this.participations.leave(actor, id);
  }
}
