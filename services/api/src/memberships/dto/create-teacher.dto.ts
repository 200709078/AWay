import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTeacherDto {
  @IsString()
  @IsNotEmpty({ message: 'Öğretmen adı gerekli.' })
  @MaxLength(80, { message: 'Öğretmen adı en fazla 80 karakter olabilir.' })
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'Öğretmen soyadı gerekli.' })
  @MaxLength(80, {
    message: 'Öğretmen soyadı en fazla 80 karakter olabilir.',
  })
  lastName: string;

  @IsString()
  @IsNotEmpty({ message: 'Telefon numarası gerekli.' })
  @MaxLength(32, { message: 'Telefon numarası çok uzun.' })
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Adres en fazla 200 karakter olabilir.' })
  address?: string;
}
