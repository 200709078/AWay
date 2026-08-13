import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateClassDto {
  @IsString()
  @IsNotEmpty({ message: 'Sınıf adı gerekli.' })
  @MaxLength(80, { message: 'Sınıf adı en fazla 80 karakter olabilir.' })
  name: string;
}
