import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LessonPeriodsController } from './lesson-periods.controller';
import { LessonPeriodsService } from './lesson-periods.service';

@Module({
  imports: [AuthModule],
  controllers: [LessonPeriodsController],
  providers: [LessonPeriodsService],
})
export class LessonPeriodsModule {}
