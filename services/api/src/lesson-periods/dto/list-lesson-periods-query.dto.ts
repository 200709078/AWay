import { IsEnum, IsOptional } from 'class-validator';
import { DayOfWeek } from '../../../generated/prisma/client';

export class ListLessonPeriodsQueryDto {
  @IsOptional()
  @IsEnum(DayOfWeek, { message: 'Geçerli bir gün seçin.' })
  dayOfWeek?: DayOfWeek;
}
