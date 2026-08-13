import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import ms from 'ms';
import { SchoolStatus } from '../../generated/prisma/client';
import { normalizePhone } from '@away/validation';
import { PrismaService } from '../database/prisma/prisma.service';

interface RefreshTokenPayload {
  sub: string;
  phone: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
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
    const phone = this.normalizePhone(phoneInput);
    const user = await this.findEligibleUserByPhone(phone);

    if (!user) {
      return this.otpRequestResponse(phone);
    }

    const code = randomInt(100000, 1000000).toString();
    const codeHash = createHash('sha256').update(code).digest('hex');

    await this.createOtp(user.id, codeHash);

    if (this.isDevelopmentEnvironment()) {
      // TODO: Gerçek SMS sağlayıcısı bağlanınca kaldırılacak.
      console.log(`[DEV OTP] ${phone}: ${code}`);
    }

    return this.otpRequestResponse(phone);
  }

  async verifyOtp(phoneInput: string, code: string) {
    const phone = this.normalizePhone(phoneInput);

    if (!/^\d{6}$/.test(code)) {
      throw new BadRequestException('OTP 6 haneli olmalıdır.');
    }

    const user = await this.findEligibleUserByPhone(phone);

    if (!user) {
      throw new UnauthorizedException('OTP doğrulanamadı.');
    }

    const now = new Date();
    const otp = await this.prisma.otpCode.findFirst({
      where: {
        userId: user.id,
        consumedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!otp || otp.attempts >= AuthService.MAX_OTP_ATTEMPTS) {
      throw new UnauthorizedException(
        'Geçerli bir OTP bulunamadı. Yeni bir OTP isteyin.',
      );
    }

    const codeHash = createHash('sha256').update(code).digest('hex');

    if (codeHash !== otp.codeHash) {
      await this.prisma.otpCode.updateMany({
        where: {
          id: otp.id,
          consumedAt: null,
          attempts: {
            lt: AuthService.MAX_OTP_ATTEMPTS,
          },
        },
        data: {
          attempts: {
            increment: 1,
          },
        },
      });

      throw new UnauthorizedException('OTP hatalı.');
    }

    const consumed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.otpCode.updateMany({
        where: {
          id: otp.id,
          userId: user.id,
          codeHash,
          consumedAt: null,
          expiresAt: {
            gt: now,
          },
          attempts: {
            lt: AuthService.MAX_OTP_ATTEMPTS,
          },
        },
        data: {
          consumedAt: now,
        },
      });

      if (result.count !== 1) {
        return false;
      }

      await tx.user.updateMany({
        where: {
          id: user.id,
          phoneVerifiedAt: null,
        },
        data: {
          phoneVerifiedAt: now,
        },
      });

      return true;
    });

    if (!consumed) {
      throw new UnauthorizedException('OTP artık geçerli değil.');
    }

    const { accessToken, refreshToken } = await this.issueTokens(
      user.id,
      user.phone,
    );

    return {
      message: 'OTP doğrulandı.',
      user,
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshTokenInput: string) {
    if (!refreshTokenInput) {
      throw new UnauthorizedException('Refresh token gerekli.');
    }

    const payload = await this.verifyRefreshToken(refreshTokenInput);
    const tokenHash = this.hashToken(refreshTokenInput);

    const rotation = await this.prisma.$transaction(async (tx) => {
      const session = await tx.refreshSession.findUnique({
        where: { tokenHash },
      });

      if (!session) {
        throw new UnauthorizedException('Refresh session bulunamadı.');
      }

      if (session.userId !== payload.sub) {
        throw new UnauthorizedException(
          'Refresh token kullanıcıyla eşleşmiyor.',
        );
      }

      if (session.revokedAt) {
        return { kind: 'replayed' as const };
      }

      const now = new Date();

      if (session.expiresAt.getTime() <= now.getTime()) {
        throw new UnauthorizedException('Refresh session süresi dolmuş.');
      }

      const user = await tx.user.findFirst({
        where: {
          id: session.userId,
          memberships: {
            some: {
              deletedAt: null,
              school: {
                is: {
                  status: SchoolStatus.ACTIVE,
                  deletedAt: null,
                },
              },
            },
          },
        },
        select: {
          id: true,
          phone: true,
          firstName: true,
          lastName: true,
        },
      });

      if (!user) {
        await tx.refreshSession.updateMany({
          where: {
            id: session.id,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
            lastUsedAt: now,
          },
        });

        return { kind: 'ineligible' as const };
      }

      const tokens = await this.createTokenPair(user.id, user.phone);
      const revoked = await tx.refreshSession.updateMany({
        where: {
          id: session.id,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          lastUsedAt: now,
        },
      });

      if (revoked.count !== 1) {
        return { kind: 'replayed' as const };
      }

      await tx.refreshSession.deleteMany({
        where: {
          userId: user.id,
          expiresAt: {
            lt: now,
          },
        },
      });

      await tx.refreshSession.create({
        data: {
          userId: user.id,
          tokenHash: tokens.refreshTokenHash,
          expiresAt: tokens.refreshExpiresAt,
          lastUsedAt: now,
        },
      });

      return { kind: 'rotated' as const, user, tokens };
    });

    if (rotation.kind === 'replayed') {
      await this.revokeAllSessions(payload.sub);
      throw new UnauthorizedException('Refresh token yeniden kullanılmış.');
    }

    if (rotation.kind === 'ineligible') {
      throw new UnauthorizedException('Aktif okul üyeliğiniz bulunmuyor.');
    }

    return {
      message: 'Token yenilendi.',
      user: rotation.user,
      accessToken: rotation.tokens.accessToken,
      refreshToken: rotation.tokens.refreshToken,
    };
  }

  async logout(refreshTokenInput: string) {
    if (!refreshTokenInput) {
      throw new UnauthorizedException('Refresh token gerekli.');
    }

    const payload = await this.verifyRefreshToken(refreshTokenInput);
    const now = new Date();
    const revoked = await this.prisma.refreshSession.updateMany({
      where: {
        tokenHash: this.hashToken(refreshTokenInput),
        userId: payload.sub,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        revokedAt: now,
        lastUsedAt: now,
      },
    });

    if (revoked.count !== 1) {
      throw new UnauthorizedException('Refresh session bulunamadı.');
    }

    return { message: 'Oturum kapatıldı.' };
  }

  private normalizePhone(phoneInput: string): string {
    try {
      return normalizePhone(phoneInput, 'TR');
    } catch {
      throw new BadRequestException('Geçersiz telefon numarası.');
    }
  }

  private async findEligibleUserByPhone(phone: string) {
    return this.prisma.user.findFirst({
      where: {
        phone,
        memberships: {
          some: {
            deletedAt: null,
            school: {
              is: {
                status: SchoolStatus.ACTIVE,
                deletedAt: null,
              },
            },
          },
        },
      },
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
      },
    });
  }

  private async createOtp(userId: string, codeHash: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            const recentRequests = await tx.otpCode.count({
              where: {
                userId,
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

            const now = new Date();

            await tx.otpCode.updateMany({
              where: {
                userId,
                consumedAt: null,
              },
              data: {
                consumedAt: now,
              },
            });

            await tx.otpCode.create({
              data: {
                userId,
                codeHash,
                expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
              },
            });
          },
          { isolationLevel: 'Serializable' },
        );

        return;
      } catch (error) {
        if (attempt < 2 && this.isSerializationFailure(error)) {
          continue;
        }

        throw error;
      }
    }
  }

  private otpRequestResponse(phone: string) {
    return {
      message: 'Telefon numarası uygunsa OTP gönderildi.',
      phone,
    };
  }

  private isDevelopmentEnvironment(): boolean {
    return !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
  }

  private isSerializationFailure(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2034'
    );
  }

  private async verifyRefreshToken(
    refreshTokenInput: string,
  ): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshTokenInput,
        { secret: this.refreshSecret },
      );

      if (!payload.sub) {
        throw new UnauthorizedException('Geçersiz refresh token.');
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException(
        'Geçersiz veya süresi dolmuş refresh token.',
      );
    }
  }

  private async issueTokens(userId: string, phone: string) {
    const tokens = await this.createTokenPair(userId, phone);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshSession.deleteMany({
        where: {
          userId,
          expiresAt: {
            lt: now,
          },
        },
      });

      await tx.refreshSession.create({
        data: {
          userId,
          tokenHash: tokens.refreshTokenHash,
          expiresAt: tokens.refreshExpiresAt,
          lastUsedAt: now,
        },
      });
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  private async createTokenPair(
    userId: string,
    phone: string,
  ): Promise<TokenPair> {
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
    const refreshDuration =
      typeof this.refreshExpiresIn === 'number'
        ? this.refreshExpiresIn
        : ms(this.refreshExpiresIn);

    if (typeof refreshDuration !== 'number') {
      throw new Error('JWT_REFRESH_EXPIRES_IN geçersiz.');
    }

    return {
      accessToken,
      refreshToken,
      refreshTokenHash: this.hashToken(refreshToken),
      refreshExpiresAt: decoded?.exp
        ? new Date(decoded.exp * 1000)
        : new Date(Date.now() + refreshDuration),
    };
  }

  private hashToken(value: string): string {
    return createHash('sha256').update(value).digest('hex');
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
