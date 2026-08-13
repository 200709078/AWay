import { IsString, Matches } from 'class-validator';

export class ListAttendanceBoardQueryDto {
  @IsString({ message: 'Yoklama tarihi gerekli.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Yoklama tarihi YYYY-MM-DD biçiminde olmalıdır.',
  })
  date: string;
}
