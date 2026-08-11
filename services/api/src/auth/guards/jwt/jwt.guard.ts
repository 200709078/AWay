import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../../../database/prisma/prisma.service';

interface JwtPayload {
  sub: string;
  phone: string;
}

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Access token gerekli.');
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      throw new UnauthorizedException('Access token gerekli.');
    }

    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException(
        'Geçersiz veya süresi dolmuş access token.',
      );
    }

    if (!payload.sub) {
      throw new UnauthorizedException('Geçersiz access token.');
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub,
      },
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

    request.user = user;

    return true;
  }
}
