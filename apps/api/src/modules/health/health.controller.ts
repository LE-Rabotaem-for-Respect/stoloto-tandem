import { Controller, Get } from '@nestjs/common';
import { TIME_ZONE } from '@tandem/domain';
import { Public } from '../../core/access';

@Controller('health')
@Public()
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', timeZone: TIME_ZONE };
  }
}
