import { Controller, Get, Query } from '@nestjs/common';
import { SearchSportsQuery } from './sports.dto';
import { SportsService } from './sports.service';
import { Public } from '../../core/access';

@Controller('sports')
@Public()
export class SportsController {
  constructor(private readonly sports: SportsService) {}

  @Get()
  search(@Query() query: SearchSportsQuery) {
    return this.sports.search(query.q, query.limit);
  }
}
