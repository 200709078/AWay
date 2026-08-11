import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import ms from 'ms';
import { PrismaService } from '../database/prisma/prisma.service';
import { normalizePhone } from '@away/validation';

interface RefreshTokenPayload {
  sub: string;
  phone: string;
}

type JwtExpiresIn = NonNullable<SignOptions['expiresIn']>;

@Injectable()
export class AuthService {
  private readonly refreshSecret: string;
  private readonly refreshExpiresIn: JwtExpiresIn;
  private static readonly MAX_OTP_ATTEMPTS = 5;
  private static readonly MAX_OTP_REQUESTS_PER_MINUTE = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {
    const refreshSecret = process.env.JWT_REFRESH_SECRET;

    if (!refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET is not defined');
    }

    this.refreshSecret = refreshSecret;
    this.refreshExpiresIn = (process.env.JWT_REFRESH_EXPIRES_IN ??
      '30d') as JwtExpiresIn;
  }

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

    const recentRequests = await this.prisma.otpCode.count({
      where: {
        userId: user.id,
        createdAt: {
          gt: new Date(Date.now() - 60 * 1000),
        },
      },
    });

    if (recentRequests >= AuthService.MAX_OTP_REQUESTS_PER_MINUTE) {
      throw new HttpException(
        'Çok fazla OTP isteği gönderildi. Lütfen bir dakika sonra tekrar deneyin.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = randomInt(100000, 1000000).toString();

    const codeHash = createHash('sha256').update(code).digest('hex');

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

    if (otp.attempts >= AuthService.MAX_OTP_ATTEMPTS) {
      throw new UnauthorizedException(
        'OTP deneme limiti aşıldı. Yeni bir OTP isteyin.',
      );
    }

    const codeHash = createHash('sha256').update(code).digest('hex');

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

    const { accessToken, refreshToken } = await this.issueTokens(
      user.id,
      user.phone,
    );

    return {
      message: 'OTP doğrulandı.',
      user: {
        id: user.id,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshTokenInput: string) {
    if (!refreshTokenInput) {
      throw new UnauthorizedException('Refresh token gerekli.');
    }

    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshTokenInput,
        { secret: this.refreshSecret },
      );
    } catch {
      throw new UnauthorizedException(
        'Geçersiz veya süresi dolmuş refresh token.',
      );
    }

    if (!payload.sub) {
      throw new UnauthorizedException('Geçersiz refresh token.');
    }

    const tokenHash = createHash('sha256')
      .update(refreshTokenInput)
      .digest('hex');

    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
    });

    if (!session) {
      throw new UnauthorizedException('Refresh session bulunamadı.');
    }

    if (session.revokedAt) {
      await this.revokeAllSessions(payload.sub);
      throw new UnauthorizedException('Refresh session iptal edilmiş.');
    }

    if (session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh session süresi dolmuş.');
    }

    if (session.userId !== payload.sub) {
      throw new UnauthorizedException('Refresh token kullanıcıyla eşleşmiyor.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Kullanıcı bulunamadı.');
    }

    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: {
        revokedAt: new Date(),
        lastUsedAt: new Date(),
      },
    });

    const tokens = await this.issueTokens(user.id, user.phone);

    return {
      message: 'Token yenilendi.',
      user: {
        id: user.id,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      ...tokens,
    };
  }

  async logout(refreshTokenInput: string) {
    if (!refreshTokenInput) {
      throw new UnauthorizedException('Refresh token gerekli.');
    }

    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshTokenInput,
        { secret: this.refreshSecret },
      );
    } catch {
      throw new UnauthorizedException(
        'Geçersiz veya süresi dolmuş refresh token.',
      );
    }

    if (!payload.sub) {
      throw new UnauthorizedException('Geçersiz refresh token.');
    }

    const tokenHash = createHash('sha256')
      .update(refreshTokenInput)
      .digest('hex');

    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
    });

    if (!session || session.revokedAt) {
      throw new UnauthorizedException('Refresh session bulunamadı.');
    }

    if (session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh session süresi dolmuş.');
    }

    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: {
        revokedAt: new Date(),
        lastUsedAt: new Date(),
      },
    });

    return { message: 'Oturum kapatıldı.' };
  }

  private async issueTokens(userId: string, phone: string) {
    const accessToken = await this.jwtService.signAsync({
      sub: userId,
      phone,
    });

    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, phone, jti: randomUUID() },
      {
        secret: this.refreshSecret,
        expiresIn: this.refreshExpiresIn,
      },
    );

    const decoded = this.jwtService.decode<{ exp?: number } | null>(
      refreshToken,
    );

    const refreshMs =
      typeof this.refreshExpiresIn === 'number'
        ? this.refreshExpiresIn
        : ms(this.refreshExpiresIn);

    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + refreshMs);

    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    await this.prisma.refreshSession.deleteMany({
      where: {
        userId,
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    await this.prisma.refreshSession.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        lastUsedAt: new Date(),
      },
    });

    return { accessToken, refreshToken };
  }

  private async revokeAllSessions(userId: string) {
    await this.prisma.refreshSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}
