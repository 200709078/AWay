import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DayOfWeek,
  type Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma/prisma.service';
import { CreateLessonPeriodDto } from './dto/create-lesson-period.dto';
import { UpdateLessonPeriodDto } from './dto/update-lesson-period.dto';

interface LessonPeriodActor {
  userId: string;
  membershipId: string;
}

interface LessonPeriodInput {
  dayOfWeek: DayOfWeek;
  lessonNumber: number;
  startMinute: number;
  endMinute: number;
}

const lessonPeriodSelect = {
  id: true,
  dayOfWeek: true,
  lessonNumber: true,
  startMinute: true,
  endMinute: true,
  createdAt: true,
  updatedAt: true,
} as const;

const dayOrder: Record<DayOfWeek, number> = {
  [DayOfWeek.MONDAY]: 1,
  [DayOfWeek.TUESDAY]: 2,
  [DayOfWeek.WEDNESDAY]: 3,
  [DayOfWeek.THURSDAY]: 4,
  [DayOfWeek.FRIDAY]: 5,
  [DayOfWeek.SATURDAY]: 6,
  [DayOfWeek.SUNDAY]: 7,
};

@Injectable()
export class LessonPeriodsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(schoolId: string, dayOfWeek: DayOfWeek | undefined) {
    const periods = await this.prisma.schoolLessonPeriod.findMany({
      where: {
        schoolId,
        ...(dayOfWeek ? { dayOfWeek } : {}),
      },
      select: lessonPeriodSelect,
    });

    return periods.sort(
      (left, right) =>
        dayOrder[left.dayOfWeek] - dayOrder[right.dayOfWeek] ||
        left.lessonNumber - right.lessonNumber,
    );
  }

  async create(
    schoolId: string,
    dto: CreateLessonPeriodDto,
    actor: LessonPeriodActor,
  ) {
    const input = this.normalizeInput(dto);

    try {
      return await this.withSerializableRetry(async (tx) => {
        await this.ensureLessonNumberAvailable(
          tx,
          schoolId,
          input.dayOfWeek,
          input.lessonNumber,
        );
        await this.ensureNoOverlap(tx, schoolId, input);

        const period = await tx.schoolLessonPeriod.create({
          data: {
            schoolId,
            ...input,
          },
          select: lessonPeriodSelect,
        });

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: actor.userId,
            actorMembershipId: actor.membershipId,
            action: 'LESSON_PERIOD_CREATED',
            entityType: 'SchoolLessonPeriod',
            entityId: period.id,
            metadata: this.periodMetadata(period),
          },
        });

        return period;
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Bu gün için bu ders numarası zaten var.');
      }

      throw error;
    }
  }

  async update(
    schoolId: string,
    lessonPeriodId: string,
    dto: UpdateLessonPeriodDto,
    actor: LessonPeriodActor,
  ) {
    try {
      return await this.withSerializableRetry(async (tx) => {
        const existing = await tx.schoolLessonPeriod.findFirst({
          where: {
            id: lessonPeriodId,
            schoolId,
          },
          select: lessonPeriodSelect,
        });

        if (!existing) {
          throw new NotFoundException('Ders saati bulunamadı.');
        }

        const input = this.normalizeInput({
          dayOfWeek: dto.dayOfWeek ?? existing.dayOfWeek,
          lessonNumber: dto.lessonNumber ?? existing.lessonNumber,
          startMinute: dto.startMinute ?? existing.startMinute,
          endMinute: dto.endMinute ?? existing.endMinute,
        });

        await this.ensureLessonNumberAvailable(
          tx,
          schoolId,
          input.dayOfWeek,
          input.lessonNumber,
          existing.id,
        );
        await this.ensureNoOverlap(tx, schoolId, input, existing.id);

        const changed =
          existing.dayOfWeek !== input.dayOfWeek ||
          existing.lessonNumber !== input.lessonNumber ||
          existing.startMinute !== input.startMinute ||
          existing.endMinute !== input.endMinute;

        if (!changed) {
          return existing;
        }

        const update = await tx.schoolLessonPeriod.updateMany({
          where: {
            id: existing.id,
            schoolId,
          },
          data: input,
        });

        if (update.count === 0) {
          throw new NotFoundException('Ders saati bulunamadı.');
        }

        const period = await tx.schoolLessonPeriod.findUniqueOrThrow({
          where: { id: existing.id },
          select: lessonPeriodSelect,
        });

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: actor.userId,
            actorMembershipId: actor.membershipId,
            action: 'LESSON_PERIOD_UPDATED',
            entityType: 'SchoolLessonPeriod',
            entityId: period.id,
            metadata: {
              previous: this.periodMetadata(existing),
              next: this.periodMetadata(period),
            },
          },
        });

        return period;
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Bu gün için bu ders numarası zaten var.');
      }

      throw error;
    }
  }

  async remove(
    schoolId: string,
    lessonPeriodId: string,
    actor: LessonPeriodActor,
  ) {
    return this.withSerializableRetry(async (tx) => {
      const period = await tx.schoolLessonPeriod.findFirst({
        where: {
          id: lessonPeriodId,
          schoolId,
        },
        select: lessonPeriodSelect,
      });

      if (!period) {
        throw new NotFoundException('Ders saati bulunamadı.');
      }

      const deletion = await tx.schoolLessonPeriod.deleteMany({
        where: {
          id: period.id,
          schoolId,
        },
      });

      if (deletion.count === 0) {
        throw new NotFoundException('Ders saati bulunamadı.');
      }

      await tx.auditLog.create({
        data: {
          schoolId,
          actorUserId: actor.userId,
          actorMembershipId: actor.membershipId,
          action: 'LESSON_PERIOD_DELETED',
          entityType: 'SchoolLessonPeriod',
          entityId: period.id,
          metadata: this.periodMetadata(period),
        },
      });

      return period;
    });
  }

  private normalizeInput(input: LessonPeriodInput): LessonPeriodInput {
    if (!Number.isInteger(input.lessonNumber) || input.lessonNumber < 1) {
      throw new BadRequestException('Ders numarası pozitif tam sayı olmalıdır.');
    }

    if (
      !Number.isInteger(input.startMinute) ||
      !Number.isInteger(input.endMinute) ||
      input.startMinute < 0 ||
      input.startMinute > 1439 ||
      input.endMinute < 1 ||
      input.endMinute > 1440
    ) {
      throw new BadRequestException('Ders saati geçersiz.');
    }

    if (input.startMinute >= input.endMinute) {
      throw new BadRequestException(
        'Ders başlangıç saati bitiş saatinden önce olmalıdır.',
      );
    }

    return input;
  }

  private async ensureLessonNumberAvailable(
    prisma: Prisma.TransactionClient,
    schoolId: string,
    dayOfWeek: DayOfWeek,
    lessonNumber: number,
    exceptId?: string,
  ) {
    const existing = await prisma.schoolLessonPeriod.findUnique({
      where: {
        schoolId_dayOfWeek_lessonNumber: {
          schoolId,
          dayOfWeek,
          lessonNumber,
        },
      },
      select: { id: true },
    });

    if (existing && existing.id !== exceptId) {
      throw new ConflictException('Bu gün için bu ders numarası zaten var.');
    }
  }

  private async ensureNoOverlap(
    prisma: Prisma.TransactionClient,
    schoolId: string,
    input: Pick<LessonPeriodInput, 'dayOfWeek' | 'startMinute' | 'endMinute'>,
    exceptId?: string,
  ) {
    const overlapping = await prisma.schoolLessonPeriod.findFirst({
      where: {
        schoolId,
        dayOfWeek: input.dayOfWeek,
        startMinute: { lt: input.endMinute },
        endMinute: { gt: input.startMinute },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: {
        lessonNumber: true,
      },
    });

    if (overlapping) {
      throw new ConflictException(
        `${overlapping.lessonNumber}. ders saatiyle çakışan bir zaman aralığı seçtiniz.`,
      );
    }
  }

  private periodMetadata(period: {
    dayOfWeek: DayOfWeek;
    lessonNumber: number;
    startMinute: number;
    endMinute: number;
  }) {
    return {
      dayOfWeek: period.dayOfWeek,
      lessonNumber: period.lessonNumber,
      startMinute: period.startMinute,
      endMinute: period.endMinute,
    };
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
        if (this.isSerializationFailure(error)) {
          if (attempt < 2) {
            continue;
          }

          throw new ConflictException(
            'Başka bir düzenlemeyle çakıştı. Lütfen tekrar deneyin.',
          );
        }

        throw error;
      }
    }

    throw new ConflictException('İşlem tamamlanamadı. Tekrar deneyin.');
  }

  private isUniqueConstraintError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
      return false;
    }

    if (error.code === 'P2002') {
      return true;
    }

    return (
      (error.code === 'P2004' || error.code === 'P2010') &&
      JSON.stringify(error).includes('SchoolLessonPeriod')
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
