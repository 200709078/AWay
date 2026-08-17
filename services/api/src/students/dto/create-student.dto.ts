import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateStudentDto {
  @IsString()
  @IsNotEmpty({ message: 'Sınıf gerekli.' })
  @MaxLength(64, { message: 'Geçersiz sınıf bilgisi.' })
  classId: string;

  @Type(() => Number)
  @IsInt({ message: 'Öğrenci numarası tam sayı olmalıdır.' })
  @Min(1, { message: 'Öğrenci numarası pozitif olmalıdır.' })
  @Max(2147483647, { message: 'Öğrenci numarası çok büyük.' })
  number: number;

  @IsString()
  @IsNotEmpty({ message: 'Öğrenci adı gerekli.' })
  @MaxLength(80, { message: 'Öğrenci adı en fazla 80 karakter olabilir.' })
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'Öğrenci soyadı gerekli.' })
  @MaxLength(80, { message: 'Öğrenci soyadı en fazla 80 karakter olabilir.' })
  lastName: string;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Telefon numarası çok uzun.' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Adres en fazla 200 karakter olabilir.' })
  address?: string;
}
