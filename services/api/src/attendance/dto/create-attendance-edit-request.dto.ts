import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAttendanceEditRequestDto {
  @IsString({ message: 'Düzeltme gerekçesi gerekli.' })
  @MinLength(3, { message: 'Düzeltme gerekçesi en az 3 karakter olmalıdır.' })
  @MaxLength(500, {
    message: 'Düzeltme gerekçesi en fazla 500 karakter olabilir.',
  })
  reason: string;
}
