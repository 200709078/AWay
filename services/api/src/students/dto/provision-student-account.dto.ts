import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ProvisionStudentAccountDto {
  @IsString()
  @IsNotEmpty({ message: 'Telefon numarası gerekli.' })
  @MaxLength(32, { message: 'Telefon numarası çok uzun.' })
  phone: string;
}
