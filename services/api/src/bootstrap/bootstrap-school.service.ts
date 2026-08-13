import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { MembershipRole } from '../../generated/prisma/client';
import { normalizePhone } from '@away/validation';
import { PrismaService } from '../database/prisma/prisma.service';

export interface CreateInitialSchoolInput {
  schoolCode: string;
  schoolName: string;
  adminFirstName: string;
  adminLastName: string;
  adminPhone: string;
}

@Injectable()
export class BootstrapSchoolService {
  constructor(private readonly prisma: PrismaService) {}

  async createInitialSchool(input: CreateInitialSchoolInput) {
    const schoolCode = this.requiredValue(input.schoolCode, 'Okul kodu');
    const schoolName = this.requiredValue(input.schoolName, 'Okul adı');
    const adminFirstName = this.requiredValue(
      input.adminFirstName,
      'Yönetici adı',
    );
    const adminLastName = this.requiredValue(
      input.adminLastName,
      'Yönetici soyadı',
    );

    let adminPhone: string;

    try {
      adminPhone = normalizePhone(input.adminPhone, 'TR');
    } catch {
      throw new BadRequestException('Geçersiz yönetici telefon numarası.');
    }

    return this.prisma.$transaction(async (tx) => {
      const existingSchool = await tx.school.findUnique({
        where: { code: schoolCode },
        select: { id: true },
      });

      if (existingSchool) {
        throw new ConflictException('Bu okul kodu zaten kullanılıyor.');
      }

      const school = await tx.school.create({
        data: {
          code: schoolCode,
          name: schoolName,
        },
        select: {
          id: true,
          code: true,
          name: true,
        },
      });

      const existingUser = await tx.user.findUnique({
        where: { phone: adminPhone },
        select: {
          id: true,
          phone: true,
          firstName: true,
          lastName: true,
        },
      });

      const adminUser =
        existingUser ??
        (await tx.user.create({
          data: {
            phone: adminPhone,
            firstName: adminFirstName,
            lastName: adminLastName,
          },
          select: {
            id: true,
            phone: true,
            firstName: true,
            lastName: true,
          },
        }));

      const membership = await tx.schoolMembership.create({
        data: {
          schoolId: school.id,
          userId: adminUser.id,
          role: MembershipRole.ADMIN,
        },
        select: { id: true },
      });

      await tx.schoolAdminAssignment.create({
        data: {
          schoolId: school.id,
          membershipId: membership.id,
        },
      });

      await tx.auditLog.create({
        data: {
          schoolId: school.id,
          action: 'SCHOOL_BOOTSTRAPPED',
          entityType: 'School',
          entityId: school.id,
          metadata: {
            source: 'bootstrap-cli',
            schoolCode: school.code,
          },
        },
      });

      return {
        school,
        adminUser,
        membershipId: membership.id,
      };
    });
  }

  private requiredValue(value: string, label: string): string {
    const normalized = value.trim();

    if (!normalized) {
      throw new BadRequestException(`${label} gerekli.`);
    }

    return normalized;
  }
}
