import { Controller, Get } from '@nestjs/common';
import { TIME_ZONE } from '@tandem/domain';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', timeZone: TIME_ZONE };
  }
}
