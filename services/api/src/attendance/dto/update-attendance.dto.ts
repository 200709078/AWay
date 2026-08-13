import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  Max,
  Min,
} from 'class-validator';
import { MAX_ABSENT_STUDENT_NUMBERS } from '../attendance.constants';

export class UpdateAttendanceDto {
  @Type(() => Number)
  @IsInt({ message: 'Beklenen revizyon tam sayı olmalıdır.' })
  @Min(1, { message: 'Beklenen revizyon pozitif olmalıdır.' })
  @Max(2147483647, { message: 'Beklenen revizyon geçersiz.' })
  expectedRevision: number;

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
