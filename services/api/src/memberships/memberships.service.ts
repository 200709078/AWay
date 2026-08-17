import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { normalizePhone } from '@away/validation';
import { MembershipRole, type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma/prisma.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { ListTeachersQueryDto } from './dto/list-teachers-query.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';

interface MembershipActor {
  userId: string;
  membershipId: string;
}

interface TeacherRecord {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  address: string | null;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    phoneVerifiedAt: Date | null;
  };
}

const teacherSummarySelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  address: true,
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      phoneVerifiedAt: true,
    },
  },
} as const;

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  async findTeachers(
    schoolId: string,
    query: ListTeachersQueryDto,
    actorUserId: string,
  ) {
    const status = query.status ?? 'active';
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const search = query.q?.trim() || undefined;

    const where: Prisma.SchoolMembershipWhereInput = {
      schoolId,
      role: MembershipRole.TEACHER,
      deletedAt: status === 'active' ? null : { not: null },
      ...(search
        ? {
            user: {
              is: {
                OR: [
                  { firstName: { contains: search, mode: 'insensitive' } },
                  { lastName: { contains: search, mode: 'insensitive' } },
                ],
              },
            },
          }
        : {}),
    };

    const [teachers, total] = await this.prisma.$transaction([
      this.prisma.schoolMembership.findMany({
        where,
        select: teacherSummarySelect,
        orderBy: [
          { user: { lastName: 'asc' } },
          { user: { firstName: 'asc' } },
          { id: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.schoolMembership.count({ where }),
    ]);

    return {
      items: teachers.map((teacher) =>
        this.toTeacherSummary(teacher, actorUserId),
      ),
      page,
      pageSize,
      total,
    };
  }

  async createTeacher(
    schoolId: string,
    dto: CreateTeacherDto,
    actor: MembershipActor,
  ) {
    const input = {
      firstName: this.normalizeName(dto.firstName, 'Öğretmen adı'),
      lastName: this.normalizeName(dto.lastName, 'Öğretmen soyadı'),
      phone: this.normalizePhone(dto.phone),
      address: this.normalizeAddress(dto.address),
    };

    try {
      return await this.withSerializableRetry(async (tx) => {
        await this.lockActiveSchool(tx, schoolId);
        const currentActor = await this.requireCurrentAdminActor(
          tx,
          schoolId,
          actor,
        );

        const user = await this.findOrCreateUser(
          tx,
          input.phone,
          input.firstName,
          input.lastName,
        );
        const existingMembership = await this.findTeacherMembershipForUpdate(
          tx,
          schoolId,
          user.id,
        );

        if (existingMembership) {
          throw new ConflictException(
            existingMembership.deletedAt
              ? 'Bu öğretmen arşivde. Yeni kayıt yerine geri yükleme işlemini kullanın.'
              : 'Bu kişi bu okulda zaten aktif öğretmen.',
          );
        }

        const membership = await tx.schoolMembership.create({
          data: {
            schoolId,
            userId: user.id,
            role: MembershipRole.TEACHER,
            address: input.address,
          },
          select: teacherSummarySelect,
        });

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: currentActor.userId,
            actorMembershipId: currentActor.membershipId,
            action: 'TEACHER_CREATED',
            entityType: 'SchoolMembership',
            entityId: membership.id,
            metadata: { role: MembershipRole.TEACHER },
          },
        });

        return this.toTeacherSummary(membership, currentActor.userId);
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Bu öğretmen üyeliği oluşturulamadı. Tekrar deneyin.',
        );
      }

      throw error;
    }
  }

  async updateTeacher(
    schoolId: string,
    teacherId: string,
    dto: UpdateTeacherDto,
    actor: MembershipActor,
  ) {
    return this.withSerializableRetry(async (tx) => {
      await this.lockActiveSchool(tx, schoolId);
      const currentActor = await this.requireCurrentAdminActor(
        tx,
        schoolId,
        actor,
      );
      const teacher = await this.findTeacherMembershipByIdForUpdate(
        tx,
        schoolId,
        teacherId,
      );

      if (!teacher) {
        throw new NotFoundException('Öğretmen bulunamadı.');
      }

      if (teacher.deletedAt) {
        throw new ConflictException(
          'Arşivlenmiş öğretmen düzenlenemez. Önce geri yükleyin.',
        );
      }

      const address =
        dto.address === undefined ? undefined : this.normalizeAddress(dto.address);

      if (address === undefined || address === teacher.address) {
        const unchanged = await tx.schoolMembership.findUniqueOrThrow({
          where: { id: teacher.id },
          select: teacherSummarySelect,
        });

        return this.toTeacherSummary(unchanged, currentActor.userId);
      }

      const update = await tx.schoolMembership.updateMany({
        where: {
          id: teacher.id,
          schoolId,
          role: MembershipRole.TEACHER,
          deletedAt: null,
        },
        data: { address },
      });

      if (update.count === 0) {
        throw new NotFoundException('Öğretmen bulunamadı.');
      }

      const updated = await tx.schoolMembership.findUniqueOrThrow({
        where: { id: teacher.id },
        select: teacherSummarySelect,
      });

      await tx.auditLog.create({
        data: {
          schoolId,
          actorUserId: currentActor.userId,
          actorMembershipId: currentActor.membershipId,
          action: 'TEACHER_UPDATED',
          entityType: 'SchoolMembership',
          entityId: updated.id,
          metadata: {
            previous: { address: teacher.address },
            next: { address: updated.address },
          },
        },
      });

      return this.toTeacherSummary(updated, currentActor.userId);
    });
  }

  async archiveTeacher(
    schoolId: string,
    teacherId: string,
    actor: MembershipActor,
  ) {
    return this.withSerializableRetry(async (tx) => {
      await this.lockActiveSchool(tx, schoolId);
      const currentActor = await this.requireCurrentAdminActor(
        tx,
        schoolId,
        actor,
      );
      const teacher = await this.findTeacherMembershipByIdForUpdate(
        tx,
        schoolId,
        teacherId,
      );

      if (!teacher) {
        throw new NotFoundException('Öğretmen bulunamadı.');
      }

      if (teacher.deletedAt) {
        throw new ConflictException(
          'Bu öğretmen zaten arşivde. Geri yükleme işlemini kullanın.',
        );
      }

      if (teacher.userId === currentActor.userId) {
        throw new ForbiddenException(
          'Kendi öğretmen erişiminizi kapatamazsınız.',
        );
      }

      const archivedAt = new Date();
      const archive = await tx.schoolMembership.updateMany({
        where: {
          id: teacher.id,
          schoolId,
          role: MembershipRole.TEACHER,
          deletedAt: null,
        },
        data: { deletedAt: archivedAt },
      });

      if (archive.count === 0) {
        throw new ConflictException('Öğretmen arşivlenemedi. Tekrar deneyin.');
      }

      const archived = await tx.schoolMembership.findUniqueOrThrow({
        where: { id: teacher.id },
        select: teacherSummarySelect,
      });

      await tx.auditLog.create({
        data: {
          schoolId,
          actorUserId: currentActor.userId,
          actorMembershipId: currentActor.membershipId,
          action: 'TEACHER_ARCHIVED',
          entityType: 'SchoolMembership',
          entityId: archived.id,
          metadata: { role: MembershipRole.TEACHER },
        },
      });

      return this.toTeacherSummary(archived, currentActor.userId);
    });
  }

  async restoreTeacher(
    schoolId: string,
    teacherId: string,
    actor: MembershipActor,
  ) {
    return this.withSerializableRetry(async (tx) => {
      await this.lockActiveSchool(tx, schoolId);
      const currentActor = await this.requireCurrentAdminActor(
        tx,
        schoolId,
        actor,
      );
      const teacher = await this.findTeacherMembershipByIdForUpdate(
        tx,
        schoolId,
        teacherId,
      );

      if (!teacher) {
        throw new NotFoundException('Öğretmen bulunamadı.');
      }

      if (!teacher.deletedAt) {
        throw new ConflictException('Bu öğretmen zaten aktif.');
      }

      const restore = await tx.schoolMembership.updateMany({
        where: {
          id: teacher.id,
          schoolId,
          role: MembershipRole.TEACHER,
          deletedAt: { not: null },
        },
        data: { deletedAt: null },
      });

      if (restore.count === 0) {
        throw new ConflictException(
          'Öğretmen geri yüklenemedi. Tekrar deneyin.',
        );
      }

      const restored = await tx.schoolMembership.findUniqueOrThrow({
        where: { id: teacher.id },
        select: teacherSummarySelect,
      });

      await tx.auditLog.create({
        data: {
          schoolId,
          actorUserId: currentActor.userId,
          actorMembershipId: currentActor.membershipId,
          action: 'TEACHER_RESTORED',
          entityType: 'SchoolMembership',
          entityId: restored.id,
          metadata: { role: MembershipRole.TEACHER },
        },
      });

      return this.toTeacherSummary(restored, currentActor.userId);
    });
  }

  private async lockActiveSchool(
    prisma: Prisma.TransactionClient,
    schoolId: string,
  ) {
    const schools = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "School"
      WHERE "id" = ${schoolId}
        AND "status" = 'ACTIVE'
        AND "deletedAt" IS NULL
      FOR UPDATE
    `;

    if (schools.length === 0) {
      throw new NotFoundException('Aktif okul bulunamadı.');
    }
  }

  private async requireCurrentAdminActor(
    prisma: Prisma.TransactionClient,
    schoolId: string,
    actor: MembershipActor,
  ) {
    const memberships = await prisma.$queryRaw<
      Array<{ id: string; userId: string }>
    >`
      SELECT "id", "userId"
      FROM "SchoolMembership"
      WHERE "id" = ${actor.membershipId}
        AND "schoolId" = ${schoolId}
        AND "userId" = ${actor.userId}
        AND "role" = 'ADMIN'
        AND "deletedAt" IS NULL
      FOR UPDATE
    `;

    const membership = memberships[0];

    if (!membership) {
      throw new ForbiddenException('Aktif ADMIN üyeliği bulunamadı.');
    }

    return {
      userId: membership.userId,
      membershipId: membership.id,
    };
  }

  private async findTeacherMembershipForUpdate(
    prisma: Prisma.TransactionClient,
    schoolId: string,
    userId: string,
  ) {
    const memberships = await prisma.$queryRaw<
      Array<{ id: string; deletedAt: Date | null }>
    >`
      SELECT "id", "deletedAt"
      FROM "SchoolMembership"
      WHERE "schoolId" = ${schoolId}
        AND "userId" = ${userId}
        AND "role" = 'TEACHER'
      FOR UPDATE
    `;

    return memberships[0] ?? null;
  }

  private async findTeacherMembershipByIdForUpdate(
    prisma: Prisma.TransactionClient,
    schoolId: string,
    teacherId: string,
  ) {
    const memberships = await prisma.$queryRaw<
      Array<{ id: string; userId: string; deletedAt: Date | null; address: string | null }>
    >`
      SELECT "id", "userId", "deletedAt", "address"
      FROM "SchoolMembership"
      WHERE "id" = ${teacherId}
        AND "schoolId" = ${schoolId}
        AND "role" = 'TEACHER'
      FOR UPDATE
    `;

    return memberships[0] ?? null;
  }

  private async findOrCreateUser(
    prisma: Prisma.TransactionClient,
    phone: string,
    firstName: string,
    lastName: string,
  ): Promise<{ id: string }> {
    const existing = await prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });

    if (existing) {
      return existing;
    }

    const created = await prisma.user.create({
      data: {
        phone,
        firstName,
        lastName,
      },
      select: { id: true },
    });

    return created;
  }

  private toTeacherSummary(teacher: TeacherRecord, actorUserId: string) {
    return {
      id: teacher.id,
      firstName: teacher.user.firstName,
      lastName: teacher.user.lastName,
      isCurrentUser: teacher.user.id === actorUserId,
      createdAt: teacher.createdAt,
      updatedAt: teacher.updatedAt,
      deletedAt: teacher.deletedAt,
      address: teacher.address,
      account: {
        status: teacher.user.phoneVerifiedAt ? 'VERIFIED' : 'UNVERIFIED',
        phone: teacher.user.phone,
      },
    };
  }

  private normalizeName(value: string, label: string): string {
    const normalized = value.trim().replace(/\s+/g, ' ');

    if (!normalized) {
      throw new BadRequestException(`${label} gerekli.`);
    }

    if (normalized.length > 80) {
      throw new BadRequestException(`${label} en fazla 80 karakter olabilir.`);
    }

    return normalized;
  }

  private normalizeAddress(value: string | undefined | null): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim().replace(/\s+/g, ' ');

    if (!normalized) {
      return null;
    }

    if (normalized.length > 200) {
      throw new BadRequestException('Adres en fazla 200 karakter olabilir.');
    }

    return normalized;
  }

  private normalizePhone(phone: string): string {
    try {
      return normalizePhone(phone, 'TR');
    } catch {
      throw new BadRequestException('Geçersiz telefon numarası.');
    }
  }

  private async withSerializableRetry<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: 'Serializable',
        });
      } catch (error) {
        if (attempt < 2 && this.isSerializationFailure(error)) {
          continue;
        }

        throw error;
      }
    }

    throw new ConflictException('İşlem tamamlanamadı. Tekrar deneyin.');
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private isSerializationFailure(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2034'
    );
  }
}
