import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewAttendanceEditRequestDto {
  @IsOptional()
  @IsString({ message: 'Yönetici notu geçersiz.' })
  @MaxLength(500, {
    message: 'Yönetici notu en fazla 500 karakter olabilir.',
  })
  note?: string;
}
