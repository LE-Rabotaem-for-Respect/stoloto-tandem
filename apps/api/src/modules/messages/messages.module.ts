import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { MessagesController } from './messages.controller';
import { MessagesRepository } from './messages.repository';
import { MessagesService } from './messages.service';

/** Обсуждение мероприятия: сообщения, ответы, правка и удаление автором (ТЗ 2.7). */
@Module({
  imports: [EventsModule],
  controllers: [MessagesController],
  providers: [MessagesRepository, MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
