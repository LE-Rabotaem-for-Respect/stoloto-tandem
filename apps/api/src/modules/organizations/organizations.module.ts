import { Module } from '@nestjs/common';
import { SportsModule } from '../sports/sports.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsRepository } from './organizations.repository';
import { OrganizationsService } from './organizations.service';

/** Контур организации (ТЗ 2.9): профиль, отправка на проверку, решение администратора. */
@Module({
  imports: [SportsModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsRepository, OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
