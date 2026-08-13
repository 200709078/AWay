import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  MembershipRole,
  SchoolStatus,
} from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { SCHOOL_ROLES_KEY } from '../decorators/school-roles.decorator';
import type { SchoolAccess } from '../types/school-access.type';

@Injectable()
export class SchoolMembershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const schoolId = request.params.schoolId;

    if (typeof schoolId !== 'string' || !schoolId.trim()) {
      throw new BadRequestException('Okul bağlamı gerekli.');
    }

    if (!request.user?.id) {
      throw new UnauthorizedException('Access token gerekli.');
    }

    const school = await this.prisma.school.findFirst({
      where: {
        id: schoolId,
        status: SchoolStatus.ACTIVE,
        deletedAt: null,
        memberships: {
          some: {
            userId: request.user.id,
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        code: true,
        name: true,
        memberships: {
          where: {
            userId: request.user.id,
            deletedAt: null,
          },
          select: {
            id: true,
            role: true,
          },
        },
      },
    });

    if (!school) {
      throw new ForbiddenException('Bu okul için aktif üyeliğiniz bulunmuyor.');
    }

    const requiredRoles =
      this.reflector.getAllAndOverride<MembershipRole[]>(SCHOOL_ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (
      requiredRoles.length > 0 &&
      !school.memberships.some((membership) =>
        requiredRoles.includes(membership.role),
      )
    ) {
      throw new ForbiddenException(
        'Bu işlem için gerekli okul rolüne sahip değilsiniz.',
      );
    }

    const schoolAccess: SchoolAccess = {
      school: {
        id: school.id,
        code: school.code,
        name: school.name,
      },
      memberships: school.memberships,
    };

    request.schoolAccess = schoolAccess;

    return true;
  }
}
