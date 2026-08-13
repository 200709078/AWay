import { Type } from 'class-transformer';
import {
  ArrayUnique,
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Matches,
  Min,
} from 'class-validator';
import { MAX_ABSENT_STUDENT_NUMBERS } from '../attendance.constants';

export class CreateAttendanceDto {
  @IsOptional()
  @IsString({ message: 'Sınıf bilgisi geçersiz.' })
  classId?: string;

  @IsString({ message: 'Yoklama tarihi gerekli.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Yoklama tarihi YYYY-MM-DD biçiminde olmalıdır.',
  })
  lessonDate: string;

  @Type(() => Number)
  @IsInt({ message: 'Ders numarası tam sayı olmalıdır.' })
  @Min(1, { message: 'Ders numarası pozitif olmalıdır.' })
  @Max(2147483647, { message: 'Ders numarası geçersiz.' })
  lessonNumber: number;

  @IsArray({ message: 'Devamsız öğrenci numaraları bir liste olmalıdır.' })
  @ArrayMaxSize(MAX_ABSENT_STUDENT_NUMBERS, {
    message: `Bir yoklamada en fazla ${MAX_ABSENT_STUDENT_NUMBERS} devamsız öğrenci numarası gönderilebilir.`,
  })
  @ArrayUnique({ message: 'Aynı öğrenci numarası birden fazla yazılamaz.' })
  @Type(() => Number)
  @IsInt({
    each: true,
    message: 'Devamsız öğrenci numaraları tam sayı olmalıdır.',
  })
  @Min(1, {
    each: true,
    message: 'Devamsız öğrenci numaraları pozitif olmalıdır.',
  })
  @Max(2147483647, {
    each: true,
    message: 'Devamsız öğrenci numarası geçersiz.',
  })
  absentStudentNumbers: number[];
}
