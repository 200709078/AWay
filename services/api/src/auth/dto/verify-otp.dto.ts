import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty({ message: 'Telefon numarası gerekli.' })
  phone: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP 6 haneli olmalıdır.' })
  code: string;
}
