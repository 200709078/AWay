import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTeacherDto {
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Adres en fazla 200 karakter olabilir.' })
  address?: string;
}