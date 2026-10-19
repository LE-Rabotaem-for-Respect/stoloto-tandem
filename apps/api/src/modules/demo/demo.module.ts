import { Module } from '@nestjs/common';
import { DemoModeGuard } from './demo-mode.guard';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({
  controllers: [DemoController],
  providers: [DemoService, DemoModeGuard],
  exports: [DemoService],
})
export class DemoModule {}
