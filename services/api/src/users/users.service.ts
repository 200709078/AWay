import { Injectable, NotFoundException } from '@nestjs/common';
import {
  SchoolStatus,
  type MembershipRole,
} from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    return user;
  }

  async findActiveSchools(userId: string) {
    const memberships = await this.prisma.schoolMembership.findMany({
      where: {
        userId,
        deletedAt: null,
        school: {
          is: {
            status: SchoolStatus.ACTIVE,
            deletedAt: null,
          },
        },
      },
      select: {
        role: true,
        school: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      orderBy: [{ schoolId: 'asc' }, { role: 'asc' }],
    });

    const schools = new Map<
      string,
      {
        id: string;
        code: string;
        name: string;
        roles: MembershipRole[];
      }
    >();

    for (const membership of memberships) {
      const existing = schools.get(membership.school.id);

      if (existing) {
        existing.roles.push(membership.role);
        continue;
      }

      schools.set(membership.school.id, {
        ...membership.school,
        roles: [membership.role],
      });
    }

    return [...schools.values()];
  }
}
