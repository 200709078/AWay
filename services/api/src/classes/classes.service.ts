import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

interface ClassActor {
  userId: string;
  membershipId: string;
}

const classSummarySelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  _count: {
    select: {
      students: {
        where: {
          deletedAt: null,
        },
      },
    },
  },
} as const;

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(schoolId: string, status: string | undefined) {
    const deletedAt = this.deletedAtFilter(status);
    const classes = await this.prisma.class.findMany({
      where: {
        schoolId,
        deletedAt,
      },
      select: classSummarySelect,
      orderBy: {
        name: 'asc',
      },
    });

    return classes.map(({ _count, ...classroom }) => ({
      ...classroom,
      studentCount: _count.students,
    }));
  }

  async create(schoolId: string, dto: CreateClassDto, actor: ClassActor) {
    const name = this.normalizeName(dto.name);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.class.findUnique({
          where: {
            schoolId_name: {
              schoolId,
              name,
            },
          },
          select: {
            id: true,
            deletedAt: true,
          },
        });

        if (existing) {
          throw new ConflictException(
            existing.deletedAt
              ? 'Bu adla arşivlenmiş bir sınıf var. Önce geri yükleyin.'
              : 'Bu sınıf adı zaten kullanılıyor.',
          );
        }

        const classroom = await tx.class.create({
          data: {
            schoolId,
            name,
          },
          select: classSummarySelect,
        });

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: actor.userId,
            actorMembershipId: actor.membershipId,
            action: 'CLASS_CREATED',
            entityType: 'Class',
            entityId: classroom.id,
            metadata: { name },
          },
        });

        return this.withStudentCount(classroom);
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Bu sınıf adı zaten kullanılıyor.');
      }

      throw error;
    }
  }

  async update(
    schoolId: string,
    classId: string,
    dto: UpdateClassDto,
    actor: ClassActor,
  ) {
    const name = this.normalizeName(dto.name);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const classroom = await tx.class.findFirst({
          where: {
            id: classId,
            schoolId,
            deletedAt: null,
          },
          select: {
            id: true,
            name: true,
          },
        });

        if (!classroom) {
          throw new NotFoundException('Sınıf bulunamadı.');
        }

        if (classroom.name === name) {
          const unchanged = await tx.class.findUniqueOrThrow({
            where: { id: classroom.id },
            select: classSummarySelect,
          });

          return this.withStudentCount(unchanged);
        }

        const sameNameClass = await tx.class.findUnique({
          where: {
            schoolId_name: {
              schoolId,
              name,
            },
          },
          select: {
            id: true,
            deletedAt: true,
          },
        });

        if (sameNameClass) {
          throw new ConflictException(
            sameNameClass.deletedAt
              ? 'Bu adla arşivlenmiş bir sınıf var. Önce geri yükleyin.'
              : 'Bu sınıf adı zaten kullanılıyor.',
          );
        }

        const update = await tx.class.updateMany({
          where: {
            id: classroom.id,
            schoolId,
            deletedAt: null,
          },
          data: { name },
        });

        if (update.count === 0) {
          throw new NotFoundException('Sınıf bulunamadı.');
        }

        const updated = await tx.class.findUniqueOrThrow({
          where: { id: classroom.id },
          select: classSummarySelect,
        });

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: actor.userId,
            actorMembershipId: actor.membershipId,
            action: 'CLASS_UPDATED',
            entityType: 'Class',
            entityId: updated.id,
            metadata: {
              previousName: classroom.name,
              name,
            },
          },
        });

        return this.withStudentCount(updated);
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Bu sınıf adı zaten kullanılıyor.');
      }

      throw error;
    }
  }

  async archive(schoolId: string, classId: string, actor: ClassActor) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const archivedAt = new Date();
            const archive = await tx.class.updateMany({
              where: {
                id: classId,
                schoolId,
                deletedAt: null,
                students: {
                  none: {
                    deletedAt: null,
                  },
                },
              },
              data: { deletedAt: archivedAt },
            });

            if (archive.count === 0) {
              const classroom = await tx.class.findFirst({
                where: {
                  id: classId,
                  schoolId,
                },
                select: {
                  deletedAt: true,
                  students: {
                    where: { deletedAt: null },
                    select: { id: true },
                    take: 1,
                  },
                },
              });

              if (!classroom || classroom.deletedAt) {
                throw new NotFoundException('Sınıf bulunamadı.');
              }

              if (classroom.students.length > 0) {
                throw new ConflictException(
                  'Aktif öğrencileri olan sınıf arşivlenemez.',
                );
              }

              throw new ConflictException('Sınıf arşivlenemedi. Tekrar deneyin.');
            }

            const archived = await tx.class.findUniqueOrThrow({
              where: { id: classId },
              select: classSummarySelect,
            });

            await tx.auditLog.create({
              data: {
                schoolId,
                actorUserId: actor.userId,
                actorMembershipId: actor.membershipId,
                action: 'CLASS_ARCHIVED',
                entityType: 'Class',
                entityId: archived.id,
                metadata: { name: archived.name },
              },
            });

            return this.withStudentCount(archived);
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
        if (attempt < 2 && this.isSerializationFailure(error)) {
          continue;
        }

        throw error;
      }
    }

    throw new ConflictException('Sınıf arşivlenemedi. Tekrar deneyin.');
  }

  async restore(schoolId: string, classId: string, actor: ClassActor) {
    return this.prisma.$transaction(async (tx) => {
      const restore = await tx.class.updateMany({
        where: {
          id: classId,
          schoolId,
          deletedAt: { not: null },
        },
        data: { deletedAt: null },
      });

      if (restore.count === 0) {
        throw new NotFoundException('Arşivlenmiş sınıf bulunamadı.');
      }

      const restored = await tx.class.findUniqueOrThrow({
        where: { id: classId },
        select: classSummarySelect,
      });

      await tx.auditLog.create({
        data: {
          schoolId,
          actorUserId: actor.userId,
          actorMembershipId: actor.membershipId,
          action: 'CLASS_RESTORED',
          entityType: 'Class',
          entityId: restored.id,
          metadata: { name: restored.name },
        },
      });

      return this.withStudentCount(restored);
    });
  }

  private normalizeName(value: string): string {
    const name = value.trim().replace(/\s+/g, ' ');

    if (!name) {
      throw new BadRequestException('Sınıf adı gerekli.');
    }

    if (name.length > 80) {
      throw new BadRequestException('Sınıf adı en fazla 80 karakter olabilir.');
    }

    return name;
  }

  private deletedAtFilter(status: string | undefined) {
    if (!status || status === 'active') {
      return null;
    }

    if (status === 'archived') {
      return { not: null };
    }

    throw new BadRequestException(
      'Sınıf durumu active veya archived olmalıdır.',
    );
  }

  private withStudentCount<T extends { _count: { students: number } }>(
    classroom: T,
  ) {
    const { _count, ...summary } = classroom;

    return {
      ...summary,
      studentCount: _count.students,
    };
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
