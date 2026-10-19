import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiError } from '../../core/errors';
import type { Actor } from '../../core/policies';
import { CurrentActor, Roles } from '../auth';
import { UpdateOrganizationDto } from './dto';
import type { OwnOrganizationView, PublicOrganizationView } from './organization-view';
import { OrganizationsService } from './organizations.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Неверный адрес — та же 404, что и у чужой неодобренной организации
function organizationId(id: string): string {
  if (!UUID.test(id)) throw new ApiError('not_found', undefined, 'Организация не найдена');
  return id;
}

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get(':id')
  view(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
  ): Promise<OwnOrganizationView | PublicOrganizationView> {
    return this.organizations.view(actor, organizationId(id));
  }

  @Patch(':id')
  @Roles('org')
  update(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<OwnOrganizationView> {
    return this.organizations.update(actor, organizationId(id), dto);
  }

  @Post(':id/submit')
  @Roles('org')
  @HttpCode(200)
  submit(@CurrentActor() actor: Actor, @Param('id') id: string): Promise<OwnOrganizationView> {
    return this.organizations.submit(actor, organizationId(id));
  }
}
