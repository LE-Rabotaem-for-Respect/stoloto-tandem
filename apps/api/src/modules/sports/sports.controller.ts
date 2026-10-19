import { Controller, Get, Query } from '@nestjs/common';
import { SearchSportsQuery } from './sports.dto';
import { SportsService } from './sports.service';

@Controller('sports')
export class SportsController {
  constructor(private readonly sports: SportsService) {}

  @Get()
  search(@Query() query: SearchSportsQuery) {
    return this.sports.search(query.q, query.limit);
  }
}
