import { Controller, Get } from '@nestjs/common';
import { TIME_ZONE } from '@tandem/domain';
import { Public } from '../../core/access';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok', timeZone: TIME_ZONE };
  }
}
