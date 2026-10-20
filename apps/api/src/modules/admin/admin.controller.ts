import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiError } from '../../core/errors';
import type { Actor } from '../../core/policies';
import { CurrentActor, Roles } from '../auth';
import type { AdminEventList } from '../events/events.service';
import { EventsService } from '../events/events.service';
import type { OwnOrganizationView } from '../organizations/organization-view';
import { MessagesService } from '../messages/messages.service';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  AdminEventsQuery,
  AdminMessagesQuery,
  AdminOrganizationsQuery,
  AdminSportsQuery,
  MergeSportDto,
  PromoteSportDto,
  RenameSportDto,
  OrganizationDecisionDto,
} from './admin.dto';
import { AdminService } from './admin.service';
import type { AdminOverview, AdminSportItem, AdminSportList } from './admin.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 20;

function page(query: { limit?: number; offset?: number }) {
  return { limit: query.limit ?? DEFAULT_LIMIT, offset: query.offset ?? 0 };
}

function sportId(id: string): string {
  if (!UUID.test(id)) throw new ApiError('not_found', undefined, 'Направление не найдено');
  return id;
}

/** Админка (ТЗ 2.10, 4.5): только администратору — и меткой маршрута, и политикой в сервисе. */
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly organizations: OrganizationsService,
    private readonly events: EventsService,
    private readonly messages: MessagesService,
  ) {}

  @Get('overview')
  @Roles('admin')
  overview(@CurrentActor() actor: Actor): Promise<AdminOverview> {
    return this.admin.overview(actor);
  }

  @Get('organizations')
  @Roles('admin')
  organizationsList(@CurrentActor() actor: Actor, @Query() query: AdminOrganizationsQuery) {
    return this.organizations.adminList(
      actor,
      { text: query.q || undefined, status: query.status, id: query.id },
      page(query),
    );
  }

  @Post('organizations/:id/decision')
  @Roles('admin')
  @HttpCode(200)
  decide(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() dto: OrganizationDecisionDto,
  ): Promise<OwnOrganizationView> {
    if (!UUID.test(id)) throw new ApiError('not_found', undefined, 'Организация не найдена');
    return this.admin.decide(actor, id, dto.decision, dto.reason);
  }

  @Get('events')
  @Roles('admin')
  eventsList(
    @CurrentActor() actor: Actor,
    @Query() query: AdminEventsQuery,
  ): Promise<AdminEventList> {
    return this.events.adminList(
      actor,
      {
        text: query.q || undefined,
        status: query.status,
        organizationId: query.organizationId,
        lastWeek: query.period === 'week',
      },
      page(query),
    );
  }

  @Get('sports')
  @Roles('admin')
  sportsList(
    @CurrentActor() actor: Actor,
    @Query() query: AdminSportsQuery,
  ): Promise<AdminSportList> {
    return this.admin.sportsList(actor, query, page(query));
  }

  @Post('sports/:id/rename')
  @Roles('admin')
  @HttpCode(200)
  renameSport(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() dto: RenameSportDto,
  ): Promise<AdminSportItem> {
    return this.admin.renameSport(actor, sportId(id), dto.name);
  }

  @Post('sports/:id/merge')
  @Roles('admin')
  @HttpCode(200)
  mergeSport(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() dto: MergeSportDto,
  ): Promise<AdminSportItem> {
    return this.admin.mergeSport(actor, sportId(id), dto.targetId);
  }

  @Post('sports/:id/promote')
  @Roles('admin')
  @HttpCode(200)
  promoteSport(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() dto: PromoteSportDto,
  ): Promise<AdminSportItem> {
    return this.admin.promoteSport(actor, sportId(id), dto.category);
  }

  @Post('sports/:id/hide')
  @Roles('admin')
  @HttpCode(200)
  hideSport(@CurrentActor() actor: Actor, @Param('id') id: string): Promise<AdminSportItem> {
    return this.admin.hideSport(actor, sportId(id));
  }

  @Get('messages')
  @Roles('admin')
  hiddenMessages(@CurrentActor() actor: Actor, @Query() query: AdminMessagesQuery) {
    return this.messages.adminHidden(actor, page(query));
  }
}
