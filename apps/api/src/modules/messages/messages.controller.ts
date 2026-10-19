import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import type { Actor } from '../../core/policies';
import { CurrentActor, Public, SignedIn } from '../auth';
import { CreateMessageDto, EditMessageDto } from './messages.dto';
import { MessagesService } from './messages.service';
import type { MessageView, ThreadView } from './messages.service';

// Обсуждение читают все, кому видна карточка, в том числе гость; писать, править и удалять
// своё — только вошедшему (метки на методах). Кто из вошедших может, решают политики
@Controller('events/:id/messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Public()
  @Get()
  list(@CurrentActor() actor: Actor, @Param('id') id: string): Promise<ThreadView[]> {
    return this.messages.list(actor, id);
  }

  @SignedIn()
  @Post()
  post(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
  ): Promise<MessageView> {
    return this.messages.post(actor, id, dto);
  }

  @SignedIn()
  @Patch(':messageId')
  edit(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Body() dto: EditMessageDto,
  ): Promise<MessageView> {
    return this.messages.edit(actor, id, messageId, dto);
  }

  @SignedIn()
  @Delete(':messageId')
  remove(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
  ): Promise<MessageView> {
    return this.messages.remove(actor, id, messageId);
  }
}
