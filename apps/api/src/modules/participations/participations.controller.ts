import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { Actor } from '../../core/policies';
import { CurrentActor, SignedIn } from '../auth';
import { JoinDto, RejectDto } from './participations.dto';
import { ParticipationsService } from './participations.service';
import type {
  MyParticipationsView,
  ParticipantsView,
  ParticipationView,
} from './participations.service';

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

  @SignedIn()
  @Get(':id/participants')
  participants(@CurrentActor() actor: Actor, @Param('id') id: string): Promise<ParticipantsView> {
    return this.participations.participants(actor, id);
  }
}

// Решения по заявкам — только организатору события; администратору — нет (ТЗ 2.4)
@Controller('participations')
export class ParticipationDecisionsController {
  constructor(private readonly participations: ParticipationsService) {}

  @SignedIn()
  @HttpCode(200)
  @Post(':id/accept')
  accept(@CurrentActor() actor: Actor, @Param('id') id: string): Promise<ParticipationView> {
    return this.participations.accept(actor, id);
  }

  @SignedIn()
  @HttpCode(200)
  @Post(':id/reject')
  reject(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() dto: RejectDto,
  ): Promise<ParticipationView> {
    return this.participations.reject(actor, id, dto.reason);
  }
}

// «Мои записи» — свои записи вошедшего (ТЗ 2.5, 4.5)
@Controller('me')
export class MyParticipationsController {
  constructor(private readonly participations: ParticipationsService) {}

  @SignedIn()
  @Get('participations')
  mine(@CurrentActor() actor: Actor): Promise<MyParticipationsView> {
    return this.participations.mine(actor);
  }
}
