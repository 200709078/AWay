import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { DayOfWeek } from '../../../generated/prisma/client';

export class UpdateLessonPeriodDto {
  @IsOptional()
  @IsEnum(DayOfWeek, { message: 'Geçerli bir gün seçin.' })
  dayOfWeek?: DayOfWeek;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Ders numarası tam sayı olmalıdır.' })
  @Min(1, { message: 'Ders numarası pozitif olmalıdır.' })
  lessonNumber?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Başlangıç saati dakika cinsinden tam sayı olmalıdır.' })
  @Min(0, { message: 'Başlangıç saati geçersiz.' })
  @Max(1439, { message: 'Başlangıç saati geçersiz.' })
  startMinute?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Bitiş saati dakika cinsinden tam sayı olmalıdır.' })
  @Min(1, { message: 'Bitiş saati geçersiz.' })
  @Max(1440, { message: 'Bitiş saati geçersiz.' })
  endMinute?: number;
}
