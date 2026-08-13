import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListTeachersQueryDto {
  @IsOptional()
  @IsIn(['active', 'archived'], {
    message: 'Öğretmen durumu active veya archived olmalıdır.',
  })
  status?: 'active' | 'archived';

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Arama metni en fazla 100 karakter olabilir.' })
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Sayfa numarası tam sayı olmalıdır.' })
  @Min(1, { message: 'Sayfa numarası en az 1 olmalıdır.' })
  @Max(100000, { message: 'Sayfa numarası çok büyük.' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Sayfa boyutu tam sayı olmalıdır.' })
  @Min(1, { message: 'Sayfa boyutu en az 1 olmalıdır.' })
  @Max(100, { message: 'Sayfa boyutu en fazla 100 olabilir.' })
  pageSize?: number;
}
