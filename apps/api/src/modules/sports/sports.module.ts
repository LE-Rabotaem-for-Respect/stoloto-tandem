import { Module } from '@nestjs/common';
import { SportsController } from './sports.controller';
import { SportsRepository } from './sports.repository';
import { SportsService } from './sports.service';

/** Каталог направлений. Другие модули находят и создают направления через SportsService. */
@Module({
  controllers: [SportsController],
  providers: [SportsRepository, SportsService],
  exports: [SportsService],
})
export class SportsModule {}
