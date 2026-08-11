import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt } from 'node:crypto';
import { PrismaService } from '../database/prisma/prisma.service';
import { normalizePhone } from '@away/validation';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async requestOtp(phoneInput: string) {
    let phone: string;

    try {
      phone = normalizePhone(phoneInput, 'TR');
    } catch {
      throw new BadRequestException('Geçersiz telefon numarası.');
    }

    const user = await this.prisma.user.findUnique({
      where: { phone },
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      throw new NotFoundException(
        'Bu telefon numarası AWay sisteminde kayıtlı değil.',
      );
    }

    const code = randomInt(100000, 1000000).toString();

    const codeHash = createHash('sha256')
      .update(code)
      .digest('hex');

    await this.prisma.otpCode.create({
      data: {
        userId: user.id,
        codeHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    // TODO: Gerçek SMS sağlayıcısı bağlanınca kaldırılacak.
    console.log(`[DEV OTP] ${phone}: ${code}`);

    return {
      message: 'OTP gönderildi.',
      phone,
    };
  }

  async verifyOtp(phoneInput: string, code: string) {
    let phone: string;

    try {
      phone = normalizePhone(phoneInput, 'TR');
    } catch {
      throw new BadRequestException('Geçersiz telefon numarası.');
    }

    if (!/^\d{6}$/.test(code)) {
      throw new BadRequestException('OTP 6 haneli olmalıdır.');
    }

    const user = await this.prisma.user.findUnique({
      where: { phone },
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      throw new NotFoundException(
        'Bu telefon numarası AWay sisteminde kayıtlı değil.',
      );
    }

    const otp = await this.prisma.otpCode.findFirst({
      where: {
        userId: user.id,
        consumedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!otp) {
      throw new UnauthorizedException(
        'Geçerli bir OTP bulunamadı. Yeni bir OTP isteyin.',
      );
    }

    const codeHash = createHash('sha256')
      .update(code)
      .digest('hex');

    if (codeHash !== otp.codeHash) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: {
          attempts: {
            increment: 1,
          },
        },
      });

      throw new UnauthorizedException('OTP hatalı.');
    }

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: {
        consumedAt: new Date(),
      },
    });

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      phone: user.phone,
    });

    return {
      message: 'OTP doğrulandı.',
      user: {
        id: user.id,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      accessToken,
    };
  }
}