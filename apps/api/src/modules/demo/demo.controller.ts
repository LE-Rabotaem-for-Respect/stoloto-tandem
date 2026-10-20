import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { IsInt, Max, Min } from 'class-validator';
import { Public } from '../../core/access';
import { DemoModeGuard } from '../auth/demo-mode.guard';
import { DemoService } from './demo.service';

/** Не дальше года вперёд: этого хватает, чтобы «завершить» любое демо-мероприятие. */
const MAX_SHIFT_SECONDS = 366 * 86_400;

export class ShiftClockDto {
  @IsInt({ message: 'Сдвиг — целое число секунд' })
  @Min(1, { message: 'Часы двигаются только вперёд' })
  @Max(MAX_SHIFT_SECONDS, { message: 'Не больше чем на год вперёд' })
  addSeconds!: number;
}

@Controller('demo')
@UseGuards(DemoModeGuard)
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  // Гостю открыто: «Сбросить демо-данные» есть на экране входа (ТЗ 4.6)
  @Post('reset')
  @Public()
  @HttpCode(200)
  async reset() {
    const lastResetAt = await this.demo.requestReset();
    return { lastResetAt: lastResetAt.toISOString() };
  }

  @Post('clock')
  @Public()
  @HttpCode(200)
  async clock(@Body() dto: ShiftClockDto) {
    const now = await this.demo.shiftClock(dto.addSeconds);
    return { now: now.toISOString() };
  }
}
