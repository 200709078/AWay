import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { normalizePhone } from '@away/validation';
import {
  MembershipRole,
  type Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';
import { ProvisionStudentAccountDto } from './dto/provision-student-account.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

interface StudentActor {
  userId: string;
  membershipId: string;
}

interface StudentRecord {
  id: string;
  number: number;
  firstName: string;
  lastName: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  class: {
    id: string;
    name: string;
  };
  user: {
    phone: string;
    phoneVerifiedAt: Date | null;
  } | null;
}

const studentSummarySelect = {
  id: true,
  number: true,
  firstName: true,
  lastName: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  class: {
    select: {
      id: true,
      name: true,
    },
  },
  user: {
    select: {
      phone: true,
      phoneVerifiedAt: true,
    },
  },
} as const;

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(schoolId: string, query: ListStudentsQueryDto) {
    const status = query.status ?? 'active';
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const classId = query.classId?.trim() || undefined;
    const search = query.q?.trim() || undefined;

    if (classId) {
      await this.requireClassInSchool(this.prisma, schoolId, classId);
    }

    const where: Prisma.StudentWhereInput = {
      schoolId,
      deletedAt: status === 'active' ? null : { not: null },
      ...(classId ? { classId } : {}),
      ...(search ? { OR: this.searchFilters(search) } : {}),
    };

    const [students, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        select: studentSummarySelect,
        orderBy: [
          { lastName: 'asc' },
          { firstName: 'asc' },
          { number: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.student.count({ where }),
    ]);

    return {
      items: students.map((student) => this.toSummary(student)),
      page,
      pageSize,
      total,
    };
  }

  async create(schoolId: string, dto: CreateStudentDto, actor: StudentActor) {
    const input = {
      classId: dto.classId.trim(),
      number: this.normalizeNumber(dto.number),
      firstName: this.normalizeName(dto.firstName, 'Öğrenci adı'),
      lastName: this.normalizeName(dto.lastName, 'Öğrenci soyadı'),
      phone: dto.phone === undefined ? undefined : this.normalizePhone(dto.phone),
    };

    try {
      return await this.withSerializableRetry(async (tx) => {
        await this.requireActiveClass(tx, schoolId, input.classId);
        await this.ensureNumberAvailable(tx, schoolId, input.number);

        let userId: string | undefined;

        if (input.phone) {
          const account = await this.findOrCreateUser(
            tx,
            input.phone,
            input.firstName,
            input.lastName,
          );
          userId = account.id;
          await this.ensureUserHasNoStudentProfile(tx, schoolId, userId);
          await this.ensureStudentMembership(tx, schoolId, userId);
        }

        const student = await tx.student.create({
          data: {
            schoolId,
            classId: input.classId,
            userId,
            number: input.number,
            firstName: input.firstName,
            lastName: input.lastName,
          },
          select: studentSummarySelect,
        });

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: actor.userId,
            actorMembershipId: actor.membershipId,
            action: 'STUDENT_CREATED',
            entityType: 'Student',
            entityId: student.id,
            metadata: {
              number: student.number,
              classId: student.class.id,
              accountProvisioned: Boolean(input.phone),
            },
          },
        });

        return this.toSummary(student);
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Bu öğrenci numarası veya hesap bağlantısı zaten kullanılıyor.',
        );
      }

      throw error;
    }
  }

  async update(
    schoolId: string,
    studentId: string,
    dto: UpdateStudentDto,
    actor: StudentActor,
  ) {
    const input = {
      classId: dto.classId.trim(),
      number: this.normalizeNumber(dto.number),
      firstName: this.normalizeName(dto.firstName, 'Öğrenci adı'),
      lastName: this.normalizeName(dto.lastName, 'Öğrenci soyadı'),
    };

    try {
      return await this.withSerializableRetry(async (tx) => {
        await this.requireActiveClass(tx, schoolId, input.classId);

        const existing = await tx.student.findFirst({
          where: {
            id: studentId,
            schoolId,
            deletedAt: null,
          },
          select: {
            id: true,
            classId: true,
            number: true,
            firstName: true,
            lastName: true,
          },
        });

        if (!existing) {
          throw new NotFoundException('Öğrenci bulunamadı.');
        }

        await this.ensureNumberAvailable(
          tx,
          schoolId,
          input.number,
          existing.id,
        );

        const changed =
          existing.classId !== input.classId ||
          existing.number !== input.number ||
          existing.firstName !== input.firstName ||
          existing.lastName !== input.lastName;

        if (!changed) {
          const unchanged = await tx.student.findUniqueOrThrow({
            where: { id: existing.id },
            select: studentSummarySelect,
          });

          return this.toSummary(unchanged);
        }

        const update = await tx.student.updateMany({
          where: {
            id: existing.id,
            schoolId,
            deletedAt: null,
          },
          data: input,
        });

        if (update.count === 0) {
          throw new NotFoundException('Öğrenci bulunamadı.');
        }

        const student = await tx.student.findUniqueOrThrow({
          where: { id: existing.id },
          select: studentSummarySelect,
        });

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: actor.userId,
            actorMembershipId: actor.membershipId,
            action: 'STUDENT_UPDATED',
            entityType: 'Student',
            entityId: student.id,
            metadata: {
              previous: {
                classId: existing.classId,
                number: existing.number,
                firstName: existing.firstName,
                lastName: existing.lastName,
              },
              next: {
                classId: student.class.id,
                number: student.number,
                firstName: student.firstName,
                lastName: student.lastName,
              },
            },
          },
        });

        return this.toSummary(student);
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Bu öğrenci numarası zaten kullanılıyor.');
      }

      throw error;
    }
  }

  async provisionAccount(
    schoolId: string,
    studentId: string,
    dto: ProvisionStudentAccountDto,
    actor: StudentActor,
  ) {
    const phone = this.normalizePhone(dto.phone);

    try {
      return await this.withSerializableRetry(async (tx) => {
        const student = await tx.student.findFirst({
          where: {
            id: studentId,
            schoolId,
            deletedAt: null,
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            userId: true,
          },
        });

        if (!student) {
          throw new NotFoundException('Öğrenci bulunamadı.');
        }

        if (student.userId) {
          throw new ConflictException(
            'Bu öğrenci için telefonla giriş hesabı zaten hazırlanmış.',
          );
        }

        const account = await this.findOrCreateUser(
          tx,
          phone,
          student.firstName,
          student.lastName,
        );
        await this.ensureUserHasNoStudentProfile(tx, schoolId, account.id);

        const link = await tx.student.updateMany({
          where: {
            id: student.id,
            schoolId,
            deletedAt: null,
            userId: null,
          },
          data: { userId: account.id },
        });

        if (link.count === 0) {
          throw new ConflictException(
            'Öğrenci hesabı hazırlanamadı. Tekrar deneyin.',
          );
        }

        await this.ensureStudentMembership(tx, schoolId, account.id);

        const linkedStudent = await tx.student.findUniqueOrThrow({
          where: { id: student.id },
          select: studentSummarySelect,
        });

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: actor.userId,
            actorMembershipId: actor.membershipId,
            action: 'STUDENT_ACCOUNT_PROVISIONED',
            entityType: 'Student',
            entityId: linkedStudent.id,
            metadata: {
              number: linkedStudent.number,
              accountProvisioned: true,
            },
          },
        });

        return this.toSummary(linkedStudent);
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Bu telefon için bu okulda bir öğrenci profili zaten var.',
        );
      }

      throw error;
    }
  }

  async archive(schoolId: string, studentId: string, actor: StudentActor) {
    return this.withSerializableRetry(async (tx) => {
      const existing = await tx.student.findFirst({
        where: {
          id: studentId,
          schoolId,
          deletedAt: null,
        },
        select: {
          id: true,
          userId: true,
        },
      });

      if (!existing) {
        throw new NotFoundException('Öğrenci bulunamadı.');
      }

      const archivedAt = new Date();
      const archive = await tx.student.updateMany({
        where: {
          id: existing.id,
          schoolId,
          deletedAt: null,
        },
        data: { deletedAt: archivedAt },
      });

      if (archive.count === 0) {
        throw new NotFoundException('Öğrenci bulunamadı.');
      }

      if (existing.userId) {
        await tx.schoolMembership.updateMany({
          where: {
            schoolId,
            userId: existing.userId,
            role: MembershipRole.STUDENT,
            deletedAt: null,
          },
          data: { deletedAt: archivedAt },
        });
      }

      const student = await tx.student.findUniqueOrThrow({
        where: { id: existing.id },
        select: studentSummarySelect,
      });

      await tx.auditLog.create({
        data: {
          schoolId,
          actorUserId: actor.userId,
          actorMembershipId: actor.membershipId,
          action: 'STUDENT_ARCHIVED',
          entityType: 'Student',
          entityId: student.id,
          metadata: {
            number: student.number,
            accountAccessRemoved: Boolean(existing.userId),
          },
        },
      });

      return this.toSummary(student);
    });
  }

  async restore(schoolId: string, studentId: string, actor: StudentActor) {
    try {
      return await this.withSerializableRetry(async (tx) => {
        const existing = await tx.student.findFirst({
          where: {
            id: studentId,
            schoolId,
            deletedAt: { not: null },
          },
          select: {
            id: true,
            classId: true,
            userId: true,
          },
        });

        if (!existing) {
          throw new NotFoundException('Arşivlenmiş öğrenci bulunamadı.');
        }

        await this.requireActiveClass(tx, schoolId, existing.classId);

        const restore = await tx.student.updateMany({
          where: {
            id: existing.id,
            schoolId,
            deletedAt: { not: null },
          },
          data: { deletedAt: null },
        });

        if (restore.count === 0) {
          throw new NotFoundException('Arşivlenmiş öğrenci bulunamadı.');
        }

        if (existing.userId) {
          await this.ensureStudentMembership(tx, schoolId, existing.userId);
        }

        const student = await tx.student.findUniqueOrThrow({
          where: { id: existing.id },
          select: studentSummarySelect,
        });

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: actor.userId,
            actorMembershipId: actor.membershipId,
            action: 'STUDENT_RESTORED',
            entityType: 'Student',
            entityId: student.id,
            metadata: {
              number: student.number,
              accountAccessRestored: Boolean(existing.userId),
            },
          },
        });

        return this.toSummary(student);
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error instanceof ConflictException) {
        throw error;
      }

      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Öğrenci geri yüklenemedi. Tekrar deneyin.',
        );
      }

      throw error;
    }
  }

  private async requireClassInSchool(
    prisma: PrismaService | Prisma.TransactionClient,
    schoolId: string,
    classId: string,
  ) {
    const classroom = await prisma.class.findFirst({
      where: {
        id: classId,
        schoolId,
      },
      select: {
        id: true,
        deletedAt: true,
      },
    });

    if (!classroom) {
      throw new NotFoundException('Sınıf bulunamadı.');
    }

    return classroom;
  }

  private async requireActiveClass(
    prisma: Prisma.TransactionClient,
    schoolId: string,
    classId: string,
  ) {
    const classroom = await this.requireClassInSchool(prisma, schoolId, classId);

    if (classroom.deletedAt) {
      throw new ConflictException('Öğrencinin sınıfı aktif olmalıdır.');
    }

    return classroom;
  }

  private async ensureNumberAvailable(
    prisma: Prisma.TransactionClient,
    schoolId: string,
    number: number,
    exceptStudentId?: string,
  ) {
    const existing = await prisma.student.findUnique({
      where: {
        schoolId_number: {
          schoolId,
          number,
        },
      },
      select: {
        id: true,
        deletedAt: true,
      },
    });

    if (!existing || existing.id === exceptStudentId) {
      return;
    }

    throw new ConflictException(
      existing.deletedAt
        ? 'Bu öğrenci numarası arşivlenmiş bir öğrenciye ait. Önce o kaydı geri yükleyin.'
        : 'Bu öğrenci numarası zaten kullanılıyor.',
    );
  }

  private async ensureUserHasNoStudentProfile(
    prisma: Prisma.TransactionClient,
    schoolId: string,
    userId: string,
  ) {
    const existing = await prisma.student.findUnique({
      where: {
        schoolId_userId: {
          schoolId,
          userId,
        },
      },
      select: {
        deletedAt: true,
      },
    });

    if (!existing) {
      return;
    }

    throw new ConflictException(
      existing.deletedAt
        ? 'Bu telefon için arşivlenmiş bir öğrenci profili var. Önce o kaydı geri yükleyin.'
        : 'Bu telefon için bu okulda bir öğrenci profili zaten var.',
    );
  }

  private async findOrCreateUser(
    prisma: Prisma.TransactionClient,
    phone: string,
    firstName: string,
    lastName: string,
  ) {
    const existing = await prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });

    if (existing) {
      return existing;
    }

    return prisma.user.create({
      data: {
        phone,
        firstName,
        lastName,
      },
      select: { id: true },
    });
  }

  private async ensureStudentMembership(
    prisma: Prisma.TransactionClient,
    schoolId: string,
    userId: string,
  ) {
    const membership = await prisma.schoolMembership.findUnique({
      where: {
        schoolId_userId_role: {
          schoolId,
          userId,
          role: MembershipRole.STUDENT,
        },
      },
      select: {
        id: true,
        deletedAt: true,
      },
    });

    if (!membership) {
      await prisma.schoolMembership.create({
        data: {
          schoolId,
          userId,
          role: MembershipRole.STUDENT,
        },
      });
      return;
    }

    if (membership.deletedAt) {
      await prisma.schoolMembership.update({
        where: { id: membership.id },
        data: { deletedAt: null },
      });
    }
  }

  private searchFilters(search: string): Prisma.StudentWhereInput[] {
    const filters: Prisma.StudentWhereInput[] = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
    ];

    if (/^\d+$/.test(search)) {
      const number = Number(search);

      if (Number.isSafeInteger(number) && number <= 2147483647) {
        filters.push({ number });
      }
    }

    return filters;
  }

  private toSummary(student: StudentRecord) {
    return {
      id: student.id,
      number: student.number,
      firstName: student.firstName,
      lastName: student.lastName,
      class: student.class,
      createdAt: student.createdAt,
      updatedAt: student.updatedAt,
      deletedAt: student.deletedAt,
      account: student.user
        ? {
            status: student.user.phoneVerifiedAt ? 'VERIFIED' : 'UNVERIFIED',
            phoneMasked: this.maskPhone(student.user.phone),
          }
        : { status: 'NOT_PROVISIONED' },
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

  private normalizeNumber(value: number): number {
    if (!Number.isInteger(value) || value < 1 || value > 2147483647) {
      throw new BadRequestException('Öğrenci numarası pozitif tam sayı olmalıdır.');
    }

    return value;
  }

  private normalizePhone(phone: string): string {
    try {
      return normalizePhone(phone, 'TR');
    } catch {
      throw new BadRequestException('Geçersiz telefon numarası.');
    }
  }

  private maskPhone(phone: string): string {
    if (phone.startsWith('+90') && phone.length === 13) {
      return `${phone.slice(0, 3)} ${phone.slice(3, 6)} ••• •• ${phone.slice(-2)}`;
    }

    return `${phone.slice(0, Math.min(4, phone.length))} ••• ${phone.slice(-2)}`;
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
