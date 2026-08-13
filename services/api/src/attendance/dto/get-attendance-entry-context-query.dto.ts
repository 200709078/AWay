import { Type } from 'class-transformer';
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';

export class GetAttendanceEntryContextQueryDto {
  @IsString({ message: 'Sınıf bilgisi gerekli.' })
  classId: string;

  @IsString({ message: 'Yoklama tarihi gerekli.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Yoklama tarihi YYYY-MM-DD biçiminde olmalıdır.',
  })
  date: string;

  @Type(() => Number)
  @IsInt({ message: 'Ders numarası tam sayı olmalıdır.' })
  @Min(1, { message: 'Ders numarası pozitif olmalıdır.' })
  @Max(2147483647, { message: 'Ders numarası geçersiz.' })
  lessonNumber: number;
}
