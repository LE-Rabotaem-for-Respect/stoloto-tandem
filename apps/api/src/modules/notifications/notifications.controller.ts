import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { Actor } from '../../core/policies';
import { CurrentActor, SignedIn } from '../auth';
import { MarkReadDto } from './notifications.dto';
import { NotificationsService } from './notifications.service';
import type { NotificationList } from './notifications.service';

// У любого вошедшего есть userId; гостя сюда не пускает guard
const userIdOf = (actor: Actor) => (actor.role === 'guest' ? '' : actor.userId);

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @SignedIn()
  list(@CurrentActor() actor: Actor): Promise<NotificationList> {
    return this.notifications.list(userIdOf(actor));
  }

  @Post('read')
  @SignedIn()
  @HttpCode(200)
  read(@CurrentActor() actor: Actor, @Body() dto: MarkReadDto): Promise<{ unread: number }> {
    return this.notifications.markRead(userIdOf(actor), dto.ids);
  }
}
