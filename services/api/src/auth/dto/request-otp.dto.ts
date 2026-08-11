import { IsNotEmpty, IsString } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  @IsNotEmpty({ message: 'Telefon numarası gerekli.' })
  phone: string;
}
