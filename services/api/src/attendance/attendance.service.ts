import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceEditRequestStatus as AttendanceEditRequestStatuses,
  AttendanceStatus,
  AttendanceStudentStatus,
  MembershipRole,
  type AttendanceEditRequestStatus,
  type Prisma,
} from '../../generated/prisma/client';
import {
  businessDateValue,
  currentIstanbulBusinessDate,
  parseBusinessDate,
  previousBusinessDate,
  type BusinessDate,
} from '../common/time/istanbul-business-date';
import { PrismaService } from '../database/prisma/prisma.service';
import { MAX_ABSENT_STUDENT_NUMBERS } from './attendance.constants';
import { CreateAttendanceEditRequestDto } from './dto/create-attendance-edit-request.dto';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { GetAttendanceEntryContextQueryDto } from './dto/get-attendance-entry-context-query.dto';
import { ListAttendanceBoardQueryDto } from './dto/list-attendance-board-query.dto';
import { ReviewAttendanceEditRequestDto } from './dto/review-attendance-edit-request.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

const EDIT_PERMISSION_DURATION_MS = 15 * 60 * 1000;
const OPEN_EDIT_REQUEST_STATUSES: AttendanceEditRequestStatus[] = [
  AttendanceEditRequestStatuses.PENDING,
  AttendanceEditRequestStatuses.APPROVED,
];

interface AttendanceActor {
  userId: string;
  membershipIds: string[];
  auditMembershipId: string;
  isAdmin: boolean;
}

interface ActiveClassRoster {
  classId: string;
  className: string;
  students: Array<{
    id: string;
    number: number;
    firstName: string;
    lastName: string;
  }>;
}

const attendanceSummarySelect = {
  id: true,
  classId: true,
  classNameSnapshot: true,
  lessonDate: true,
  lessonNumber: true,
  lessonStartMinuteSnapshot: true,
  lessonEndMinuteSnapshot: true,
  submittedByMembershipId: true,
  status: true,
  revision: true,
  submittedAt: true,
  reviewLockedAt: true,
  reviewLockedByMembershipId: true,
  updatedAt: true,
  _count: {
    select: {
      studentSnapshots: true,
    },
  },
  editRequests: {
    where: {
      status: { in: OPEN_EDIT_REQUEST_STATUSES },
    },
    select: {
      status: true,
      editExpiresAt: true,
    },
  },
  studentSnapshots: {
    where: { status: AttendanceStudentStatus.ABSENT },
    select: {
      studentNumber: true,
      status: true,
    },
    orderBy: { studentNumber: 'asc' },
  },
} satisfies Prisma.AttendanceSelect;

const attendanceDetailSelect = {
  ...attendanceSummarySelect,
  submittedByMembership: {
    select: {
      id: true,
      role: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  },
  reviewLockedByMembership: {
    select: {
      id: true,
      role: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  },
  studentSnapshots: {
    select: {
      studentNumber: true,
      firstName: true,
      lastName: true,
      status: true,
    },
    orderBy: { studentNumber: 'asc' },
  },
  editRequests: {
    where: {
      status: { in: OPEN_EDIT_REQUEST_STATUSES },
    },
    select: {
      id: true,
      requestedByMembershipId: true,
      reason: true,
      status: true,
      requestedAt: true,
      reviewedAt: true,
      reviewNote: true,
      editGrantedAt: true,
      editExpiresAt: true,
      completedAt: true,
      requestedByMembership: {
        select: {
          role: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
    orderBy: { requestedAt: 'desc' },
  },
} satisfies Prisma.AttendanceSelect;

type AttendanceSummaryRecord = Prisma.AttendanceGetPayload<{
  select: typeof attendanceSummarySelect;
}>;
type AttendanceDetailRecord = Prisma.AttendanceGetPayload<{
  select: typeof attendanceDetailSelect;
}>;

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async findBoard(
    schoolId: string,
    query: ListAttendanceBoardQueryDto,
    actor: AttendanceActor,
  ) {
    const businessDate = this.requireBusinessDate(query.date);
    const [school, classes, lessonPeriods, attendances] = await Promise.all([
      this.prisma.school.findUniqueOrThrow({
        where: { id: schoolId },
        select: { attendanceFinalizedThroughDate: true },
      }),
      this.prisma.class.findMany({
        where: { schoolId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.schoolLessonPeriod.findMany({
        where: {
          schoolId,
          dayOfWeek: businessDate.dayOfWeek,
        },
        select: {
          id: true,
          lessonNumber: true,
          startMinute: true,
          endMinute: true,
        },
        orderBy: { lessonNumber: 'asc' },
      }),
      this.prisma.attendance.findMany({
        where: {
          schoolId,
          lessonDate: businessDate.date,
        },
        select: attendanceSummarySelect,
        orderBy: [{ lessonNumber: 'asc' }, { classNameSnapshot: 'asc' }],
      }),
    ]);
    const finalizedThroughDate = school.attendanceFinalizedThroughDate
      ? businessDateValue(school.attendanceFinalizedThroughDate)
      : null;

    return {
      date: businessDate.value,
      dayOfWeek: businessDate.dayOfWeek,
      finalizedThroughDate,
      isFinalized: this.isDateFinalized(businessDate.value, finalizedThroughDate),
      classes,
      lessonPeriods,
      attendances: attendances.map((attendance) =>
        this.toSummary(attendance, finalizedThroughDate, actor),
      ),
    };
  }

  async getEntryContext(
    schoolId: string,
    query: GetAttendanceEntryContextQueryDto,
  ) {
    const businessDate = this.requireSubmittableBusinessDate(query.date);
    const school = await this.prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { attendanceFinalizedThroughDate: true },
    });
    const finalizedThroughDate = school.attendanceFinalizedThroughDate
      ? businessDateValue(school.attendanceFinalizedThroughDate)
      : null;

    this.ensureDateNotFinalized(businessDate.value, finalizedThroughDate);

    const [roster, lessonPeriod, existingAttendance] = await Promise.all([
      this.requireActiveClassRoster(this.prisma, schoolId, query.classId),
      this.prisma.schoolLessonPeriod.findFirst({
        where: {
          schoolId,
          dayOfWeek: businessDate.dayOfWeek,
          lessonNumber: query.lessonNumber,
        },
        select: {
          id: true,
          startMinute: true,
          endMinute: true,
        },
      }),
      this.prisma.attendance.findUnique({
        where: {
          schoolId_classId_lessonDate_lessonNumber: {
            schoolId,
            classId: query.classId,
            lessonDate: businessDate.date,
            lessonNumber: query.lessonNumber,
          },
        },
        select: { id: true },
      }),
    ]);

    if (!lessonPeriod) {
      throw this.lessonPeriodNotFound(businessDate, query.lessonNumber);
    }

    return {
      date: businessDate.value,
      dayOfWeek: businessDate.dayOfWeek,
      class: {
        id: roster.classId,
        name: roster.className,
      },
      lessonPeriod: {
        lessonNumber: query.lessonNumber,
        startMinute: lessonPeriod.startMinute,
        endMinute: lessonPeriod.endMinute,
      },
      students: roster.students.map((student) => ({
        number: student.number,
        firstName: student.firstName,
        lastName: student.lastName,
      })),
      existingAttendanceId: existingAttendance?.id ?? null,
    };
  }

  async create(
    schoolId: string,
    dto: CreateAttendanceDto,
    actor: AttendanceActor,
  ) {
    const businessDate = this.requireSubmittableBusinessDate(dto.lessonDate);
    const lessonNumber = this.requireLessonNumber(dto.lessonNumber);
    const absentStudentNumbers = this.normalizeAbsentStudentNumbers(
      dto.absentStudentNumbers,
    );
    const requestedClassId = dto.classId?.trim() || undefined;

    try {
      return await this.withSerializableRetry(async (tx) => {
        const school = await this.lockSchoolForAttendance(tx, schoolId);
        const currentActor = await this.requireCurrentAttendanceActor(
          tx,
          schoolId,
          actor,
        );
        const finalizedThroughDate = school.attendanceFinalizedThroughDate
          ? businessDateValue(school.attendanceFinalizedThroughDate)
          : null;

        this.ensureDateNotFinalized(businessDate.value, finalizedThroughDate);

        const [roster, lessonPeriod] = await Promise.all([
          this.resolveClassRoster(
            tx,
            schoolId,
            requestedClassId,
            absentStudentNumbers,
          ),
          tx.schoolLessonPeriod.findFirst({
            where: {
              schoolId,
              dayOfWeek: businessDate.dayOfWeek,
              lessonNumber,
            },
            select: {
              startMinute: true,
              endMinute: true,
            },
          }),
        ]);

        if (!lessonPeriod) {
          throw this.lessonPeriodNotFound(businessDate, lessonNumber);
        }

        await this.advanceFinalizationBoundary(
          tx,
          schoolId,
          businessDate,
          finalizedThroughDate,
          currentActor,
        );

        const absentNumbers = new Set(absentStudentNumbers);
        const attendance = await tx.attendance.create({
          data: {
            schoolId,
            classId: roster.classId,
            classNameSnapshot: roster.className,
            lessonDate: businessDate.date,
            lessonNumber,
            lessonStartMinuteSnapshot: lessonPeriod.startMinute,
            lessonEndMinuteSnapshot: lessonPeriod.endMinute,
            submittedByMembershipId: currentActor.auditMembershipId,
            studentSnapshots: {
              create: roster.students.map((student) => ({
                studentId: student.id,
                studentNumber: student.number,
                firstName: student.firstName,
                lastName: student.lastName,
                status: absentNumbers.has(student.number)
                  ? AttendanceStudentStatus.ABSENT
                  : AttendanceStudentStatus.PRESENT,
              })),
            },
          },
          select: attendanceSummarySelect,
        });

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: currentActor.userId,
            actorMembershipId: currentActor.auditMembershipId,
            action: 'ATTENDANCE_SUBMITTED',
            entityType: 'Attendance',
            entityId: attendance.id,
            metadata: {
              classId: roster.classId,
              lessonDate: businessDate.value,
              lessonNumber,
              absentStudentNumbers,
              absentCount: absentStudentNumbers.length,
              presentCount: roster.students.length - absentStudentNumbers.length,
            },
          },
        });

        const currentFinalization = await tx.school.findUniqueOrThrow({
          where: { id: schoolId },
          select: { attendanceFinalizedThroughDate: true },
        });

        return this.toSummary(
          attendance,
          currentFinalization.attendanceFinalizedThroughDate
            ? businessDateValue(currentFinalization.attendanceFinalizedThroughDate)
            : null,
          currentActor,
        );
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Bu sınıfın seçilen tarih ve ders saati için yoklaması zaten gönderilmiş.',
        );
      }

      throw error;
    }
  }

  async findDetail(
    schoolId: string,
    attendanceId: string,
    actor: AttendanceActor,
  ) {
    const [school, attendance] = await Promise.all([
      this.prisma.school.findUniqueOrThrow({
        where: { id: schoolId },
        select: { attendanceFinalizedThroughDate: true },
      }),
      this.prisma.attendance.findFirst({
        where: {
          id: attendanceId,
          schoolId,
        },
        select: attendanceDetailSelect,
      }),
    ]);

    if (!attendance) {
      throw new NotFoundException('Yoklama bulunamadı.');
    }

    const finalizedThroughDate = school.attendanceFinalizedThroughDate
      ? businessDateValue(school.attendanceFinalizedThroughDate)
      : null;

    return this.toDetail(attendance, finalizedThroughDate, actor);
  }

  async update(
    schoolId: string,
    attendanceId: string,
    dto: UpdateAttendanceDto,
    actor: AttendanceActor,
  ) {
    const absentStudentNumbers = this.normalizeAbsentStudentNumbers(
      dto.absentStudentNumbers,
    );

    return this.withSerializableRetry(async (tx) => {
      const school = await this.lockSchoolForAttendance(tx, schoolId);
      const currentActor = await this.requireCurrentAttendanceActor(
        tx,
        schoolId,
        actor,
      );
      const attendance = await tx.attendance.findFirst({
        where: {
          id: attendanceId,
          schoolId,
        },
        select: {
          id: true,
          lessonDate: true,
          status: true,
          revision: true,
          submittedByMembershipId: true,
          studentSnapshots: {
            select: {
              studentNumber: true,
              status: true,
            },
            orderBy: { studentNumber: 'asc' },
          },
        },
      });

      if (!attendance) {
        throw new NotFoundException('Yoklama bulunamadı.');
      }

      const finalizedThroughDate = school.attendanceFinalizedThroughDate
        ? businessDateValue(school.attendanceFinalizedThroughDate)
        : null;
      const lessonDate = businessDateValue(attendance.lessonDate);
      this.ensureDateNotFinalized(lessonDate, finalizedThroughDate);

      if (attendance.revision !== dto.expectedRevision) {
        throw new ConflictException(
          'Yoklama başka biri tarafından değiştirildi. Güncel kaydı yeniden yükleyin.',
        );
      }

      const editGrant = await this.requireEditPermissionIfLocked(
        tx,
        attendance,
        currentActor,
      );
      this.ensureSnapshotNumbersKnown(
        attendance.studentSnapshots.map((snapshot) => snapshot.studentNumber),
        absentStudentNumbers,
      );

      const previousAbsentNumbers = attendance.studentSnapshots
        .filter((snapshot) => snapshot.status === AttendanceStudentStatus.ABSENT)
        .map((snapshot) => snapshot.studentNumber);

      if (this.sameNumbers(previousAbsentNumbers, absentStudentNumbers)) {
        const unchanged = await tx.attendance.findUniqueOrThrow({
          where: { id: attendance.id },
          select: attendanceSummarySelect,
        });

        return this.toSummary(unchanged, finalizedThroughDate, currentActor);
      }

      const update = await tx.attendance.updateMany({
        where: {
          id: attendance.id,
          schoolId,
          revision: dto.expectedRevision,
          status: attendance.status,
        },
        data: {
          revision: { increment: 1 },
        },
      });

      if (update.count === 0) {
        throw new ConflictException(
          'Yoklama başka biri tarafından değiştirildi. Güncel kaydı yeniden yükleyin.',
        );
      }

      await tx.attendanceStudentSnapshot.updateMany({
        where: { attendanceId: attendance.id },
        data: { status: AttendanceStudentStatus.PRESENT },
      });
      if (absentStudentNumbers.length > 0) {
        await tx.attendanceStudentSnapshot.updateMany({
          where: {
            attendanceId: attendance.id,
            studentNumber: { in: absentStudentNumbers },
          },
          data: { status: AttendanceStudentStatus.ABSENT },
        });
      }

      if (editGrant) {
        const consumedEditGrant = await tx.attendanceEditRequest.updateMany({
          where: {
            id: editGrant.id,
            status: AttendanceEditRequestStatuses.APPROVED,
            editExpiresAt: { gt: new Date() },
          },
          data: {
            status: AttendanceEditRequestStatuses.COMPLETED,
            completedAt: new Date(),
          },
        });

        if (consumedEditGrant.count === 0) {
          throw new ConflictException(
            'Düzenleme izni artık geçerli değil. Yoklamayı yeniden yükleyin.',
          );
        }
      }

      const updated = await tx.attendance.findUniqueOrThrow({
        where: { id: attendance.id },
        select: attendanceSummarySelect,
      });
      await tx.auditLog.create({
        data: {
          schoolId,
          actorUserId: currentActor.userId,
          actorMembershipId: currentActor.auditMembershipId,
          action: 'ATTENDANCE_ABSENCES_UPDATED',
          entityType: 'Attendance',
          entityId: attendance.id,
          metadata: {
            lessonDate,
            previousAbsentStudentNumbers: previousAbsentNumbers,
            absentStudentNumbers,
            previousRevision: attendance.revision,
            revision: updated.revision,
            editRequestId: editGrant?.id ?? null,
          },
        },
      });

      return this.toSummary(updated, finalizedThroughDate, currentActor);
    });
  }

  async reviewLock(
    schoolId: string,
    attendanceId: string,
    actor: AttendanceActor,
  ) {
    return this.withSerializableRetry(async (tx) => {
      const school = await this.lockSchoolForAttendance(tx, schoolId);
      const currentActor = await this.requireCurrentAttendanceActor(
        tx,
        schoolId,
        actor,
      );
      this.requireCurrentAdmin(currentActor);
      const attendance = await tx.attendance.findFirst({
        where: { id: attendanceId, schoolId },
        select: attendanceSummarySelect,
      });

      if (!attendance) {
        throw new NotFoundException('Yoklama bulunamadı.');
      }

      const finalizedThroughDate = school.attendanceFinalizedThroughDate
        ? businessDateValue(school.attendanceFinalizedThroughDate)
        : null;
      this.ensureDateNotFinalized(
        businessDateValue(attendance.lessonDate),
        finalizedThroughDate,
      );

      if (attendance.status === AttendanceStatus.LOCKED) {
        return this.toSummary(attendance, finalizedThroughDate, currentActor);
      }

      const lockedAt = new Date();
      const lock = await tx.attendance.updateMany({
        where: {
          id: attendance.id,
          schoolId,
          status: AttendanceStatus.SUBMITTED,
        },
        data: {
          status: AttendanceStatus.LOCKED,
          reviewLockedAt: lockedAt,
          reviewLockedByMembershipId: currentActor.auditMembershipId,
        },
      });

      if (lock.count === 0) {
        throw new ConflictException('Yoklama inceleme için kilitlenemedi.');
      }

      const locked = await tx.attendance.findUniqueOrThrow({
        where: { id: attendance.id },
        select: attendanceSummarySelect,
      });
      await tx.auditLog.create({
        data: {
          schoolId,
          actorUserId: currentActor.userId,
          actorMembershipId: currentActor.auditMembershipId,
          action: 'ATTENDANCE_REVIEW_LOCKED',
          entityType: 'Attendance',
          entityId: attendance.id,
          metadata: {
            lessonDate: businessDateValue(attendance.lessonDate),
            revision: locked.revision,
          },
        },
      });

      return this.toSummary(locked, finalizedThroughDate, currentActor);
    });
  }

  async createEditRequest(
    schoolId: string,
    attendanceId: string,
    dto: CreateAttendanceEditRequestDto,
    actor: AttendanceActor,
  ) {
    const reason = this.normalizeReason(dto.reason, 'Düzeltme gerekçesi');

    try {
      return await this.withSerializableRetry(async (tx) => {
        const school = await this.lockSchoolForAttendance(tx, schoolId);
        const currentActor = await this.requireCurrentAttendanceActor(
          tx,
          schoolId,
          actor,
        );
        const attendance = await tx.attendance.findFirst({
          where: { id: attendanceId, schoolId },
          select: {
            id: true,
            lessonDate: true,
            status: true,
            reviewLockedAt: true,
          },
        });

        if (!attendance) {
          throw new NotFoundException('Yoklama bulunamadı.');
        }

        const finalizedThroughDate = school.attendanceFinalizedThroughDate
          ? businessDateValue(school.attendanceFinalizedThroughDate)
          : null;
        this.ensureDateNotFinalized(
          businessDateValue(attendance.lessonDate),
          finalizedThroughDate,
        );

        if (
          attendance.status !== AttendanceStatus.LOCKED ||
          !attendance.reviewLockedAt
        ) {
          throw new ConflictException(
            'Düzeltme talebi yalnız inceleme kilitli yoklama için açılabilir.',
          );
        }

        await this.expireOpenEditPermissions(tx, attendance.id, new Date());
        const openRequest = await tx.attendanceEditRequest.findFirst({
          where: {
            attendanceId: attendance.id,
            status: {
              in: [
                AttendanceEditRequestStatuses.PENDING,
                AttendanceEditRequestStatuses.APPROVED,
              ],
            },
          },
          select: { id: true },
        });

        if (openRequest) {
          throw new ConflictException(
            'Bu yoklama için sonuçlanmayı bekleyen bir düzeltme talebi zaten var.',
          );
        }

        const editRequest = await tx.attendanceEditRequest.create({
          data: {
            attendanceId: attendance.id,
            requestedByMembershipId: currentActor.auditMembershipId,
            reason,
          },
          select: this.editRequestSelect(),
        });

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: currentActor.userId,
            actorMembershipId: currentActor.auditMembershipId,
            action: 'ATTENDANCE_EDIT_REQUESTED',
            entityType: 'AttendanceEditRequest',
            entityId: editRequest.id,
            metadata: {
              attendanceId: attendance.id,
              lessonDate: businessDateValue(attendance.lessonDate),
            },
          },
        });

        return this.toEditRequest(editRequest);
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Bu yoklama için sonuçlanmayı bekleyen bir düzeltme talebi zaten var.',
        );
      }

      throw error;
    }
  }

  async listEditRequests(schoolId: string, attendanceId: string) {
    const attendance = await this.prisma.attendance.findFirst({
      where: { id: attendanceId, schoolId },
      select: { id: true },
    });

    if (!attendance) {
      throw new NotFoundException('Yoklama bulunamadı.');
    }

    const now = new Date();
    const requests = await this.prisma.attendanceEditRequest.findMany({
      where: {
        attendanceId,
        OR: [
          { status: AttendanceEditRequestStatuses.PENDING },
          {
            status: AttendanceEditRequestStatuses.APPROVED,
            editExpiresAt: { gt: now },
          },
        ],
      },
      select: this.editRequestSelect(),
      orderBy: { requestedAt: 'asc' },
    });

    return requests.map((request) => this.toEditRequest(request));
  }

  async approveEditRequest(
    schoolId: string,
    attendanceId: string,
    requestId: string,
    dto: ReviewAttendanceEditRequestDto,
    actor: AttendanceActor,
  ) {
    return this.reviewEditRequest(
      schoolId,
      attendanceId,
      requestId,
      dto,
      actor,
      AttendanceEditRequestStatuses.APPROVED,
    );
  }

  async rejectEditRequest(
    schoolId: string,
    attendanceId: string,
    requestId: string,
    dto: ReviewAttendanceEditRequestDto,
    actor: AttendanceActor,
  ) {
    return this.reviewEditRequest(
      schoolId,
      attendanceId,
      requestId,
      dto,
      actor,
      AttendanceEditRequestStatuses.REJECTED,
    );
  }

  private async reviewEditRequest(
    schoolId: string,
    attendanceId: string,
    requestId: string,
    dto: ReviewAttendanceEditRequestDto,
    actor: AttendanceActor,
    decision:
      | typeof AttendanceEditRequestStatuses.APPROVED
      | typeof AttendanceEditRequestStatuses.REJECTED,
  ) {
    const note = dto.note?.trim() || null;

    try {
      const reviewed = await this.withSerializableRetry(async (tx) => {
        const school = await this.lockSchoolForAttendance(tx, schoolId);
        const currentActor = await this.requireCurrentAttendanceActor(
          tx,
          schoolId,
          actor,
        );
        this.requireCurrentAdmin(currentActor);
        const attendance = await tx.attendance.findFirst({
          where: { id: attendanceId, schoolId },
          select: {
            id: true,
            lessonDate: true,
            status: true,
            reviewLockedAt: true,
          },
        });

        if (!attendance) {
          throw new NotFoundException('Yoklama bulunamadı.');
        }

        const finalizedThroughDate = school.attendanceFinalizedThroughDate
          ? businessDateValue(school.attendanceFinalizedThroughDate)
          : null;
        this.ensureDateNotFinalized(
          businessDateValue(attendance.lessonDate),
          finalizedThroughDate,
        );

        if (
          attendance.status !== AttendanceStatus.LOCKED ||
          !attendance.reviewLockedAt
        ) {
          throw new ConflictException(
            'Kesinleşmemiş inceleme kilidi olmayan yoklamada talep sonuçlandırılamaz.',
          );
        }

        const now = new Date();
        await this.expireOpenEditPermissions(tx, attendance.id, now);
        const editRequest = await tx.attendanceEditRequest.findFirst({
          where: {
            id: requestId,
            attendanceId: attendance.id,
            status: AttendanceEditRequestStatuses.PENDING,
          },
          select: {
            id: true,
            requestedByMembershipId: true,
          },
        });

        if (!editRequest) {
          throw new NotFoundException(
            'Bekleyen düzeltme talebi bulunamadı.',
          );
        }

        if (decision === AttendanceEditRequestStatuses.APPROVED) {
          const activeRequester = await this.findActivePersonnelMembership(
            tx,
            schoolId,
            editRequest.requestedByMembershipId,
          );

          if (!activeRequester) {
            await tx.attendanceEditRequest.update({
              where: { id: editRequest.id },
              data: {
                status: AttendanceEditRequestStatuses.EXPIRED,
                invalidatedAt: now,
              },
            });
            await tx.auditLog.create({
              data: {
                schoolId,
                actorUserId: currentActor.userId,
                actorMembershipId: currentActor.auditMembershipId,
                action: 'ATTENDANCE_EDIT_REQUEST_EXPIRED',
                entityType: 'AttendanceEditRequest',
                entityId: editRequest.id,
                metadata: {
                  attendanceId: attendance.id,
                  reason: 'REQUESTER_MEMBERSHIP_INACTIVE',
                },
              },
            });

            return null;
          }
        }

        const reviewed = await tx.attendanceEditRequest.update({
          where: { id: editRequest.id },
          data: {
            status: decision,
            reviewedByMembershipId: currentActor.auditMembershipId,
            reviewedAt: now,
            reviewNote: note,
            ...(decision === AttendanceEditRequestStatuses.APPROVED
              ? {
                  editGrantedAt: now,
                  editExpiresAt: new Date(
                    now.getTime() + EDIT_PERMISSION_DURATION_MS,
                  ),
                }
              : {}),
          },
          select: this.editRequestSelect(),
        });

        await tx.auditLog.create({
          data: {
            schoolId,
            actorUserId: currentActor.userId,
            actorMembershipId: currentActor.auditMembershipId,
            action:
              decision === AttendanceEditRequestStatuses.APPROVED
                ? 'ATTENDANCE_EDIT_APPROVED'
                : 'ATTENDANCE_EDIT_REJECTED',
            entityType: 'AttendanceEditRequest',
            entityId: reviewed.id,
            metadata: {
              attendanceId: attendance.id,
              requestedByMembershipId: reviewed.requestedByMembershipId,
              editExpiresAt: reviewed.editExpiresAt?.toISOString() ?? null,
            },
          },
        });

        return this.toEditRequest(reviewed);
      });

      if (!reviewed) {
        throw new ConflictException(
          'Talep sahibinin bu okulda artık aktif personel üyeliği yok.',
        );
      }

      return reviewed;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Bu yoklama için hâlihazırda açık bir düzenleme izni var.',
        );
      }

      throw error;
    }
  }

  private requireBusinessDate(value: string): BusinessDate {
    const businessDate = parseBusinessDate(value);

    if (!businessDate) {
      throw new BadRequestException('Yoklama tarihi geçersiz.');
    }

    return businessDate;
  }

  private requireSubmittableBusinessDate(value: string): BusinessDate {
    const businessDate = this.requireBusinessDate(value);

    if (businessDate.value > currentIstanbulBusinessDate()) {
      throw new BadRequestException('Gelecekteki tarih için yoklama gönderilemez.');
    }

    return businessDate;
  }

  private requireLessonNumber(value: number): number {
    if (!Number.isInteger(value) || value < 1 || value > 2147483647) {
      throw new BadRequestException('Ders numarası pozitif tam sayı olmalıdır.');
    }

    return value;
  }

  private normalizeAbsentStudentNumbers(numbers: number[]): number[] {
    if (!Array.isArray(numbers)) {
      throw new BadRequestException(
        'Devamsız öğrenci numaraları bir liste olmalıdır.',
      );
    }

    if (numbers.length > MAX_ABSENT_STUDENT_NUMBERS) {
      throw new BadRequestException(
        `Bir yoklamada en fazla ${MAX_ABSENT_STUDENT_NUMBERS} devamsız öğrenci numarası gönderilebilir.`,
      );
    }

    const normalized = [...numbers].sort((left, right) => left - right);

    if (
      normalized.some(
        (number) =>
          !Number.isInteger(number) || number < 1 || number > 2147483647,
      )
    ) {
      throw new BadRequestException(
        'Devamsız öğrenci numaraları pozitif tam sayı olmalıdır.',
      );
    }

    if (new Set(normalized).size !== normalized.length) {
      throw new BadRequestException(
        'Aynı öğrenci numarası birden fazla yazılamaz.',
      );
    }

    return normalized;
  }

  private async resolveClassRoster(
    prisma: Prisma.TransactionClient,
    schoolId: string,
    requestedClassId: string | undefined,
    absentStudentNumbers: number[],
  ): Promise<ActiveClassRoster> {
    if (requestedClassId) {
      const roster = await this.requireActiveClassRoster(
        prisma,
        schoolId,
        requestedClassId,
      );
      this.ensureRosterNumbersKnown(roster, absentStudentNumbers);

      return roster;
    }

    if (absentStudentNumbers.length === 0) {
      throw new BadRequestException(
        'Herkes mevcut yoklaması için sınıf seçilmelidir.',
      );
    }

    const absentStudents = await prisma.student.findMany({
      where: {
        schoolId,
        deletedAt: null,
        number: { in: absentStudentNumbers },
      },
      select: {
        classId: true,
        number: true,
      },
    });
    const foundNumbers = new Set(absentStudents.map((student) => student.number));
    const unknownNumbers = absentStudentNumbers.filter(
      (number) => !foundNumbers.has(number),
    );

    if (unknownNumbers.length > 0) {
      throw new BadRequestException(
        `Bu okulda aktif olmayan veya bulunmayan öğrenci numarası var: ${unknownNumbers.join(', ')}.`,
      );
    }

    const classIds = new Set(absentStudents.map((student) => student.classId));

    if (classIds.size !== 1) {
      throw new BadRequestException(
        'Devamsız öğrenci numaraları aynı aktif sınıfa ait olmalıdır.',
      );
    }

    return this.requireActiveClassRoster(
      prisma,
      schoolId,
      absentStudents[0].classId,
    );
  }

  private async requireActiveClassRoster(
    prisma: PrismaService | Prisma.TransactionClient,
    schoolId: string,
    classId: string,
  ): Promise<ActiveClassRoster> {
    const classroom = await prisma.class.findFirst({
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
      throw new NotFoundException('Aktif sınıf bulunamadı.');
    }

    const students = await prisma.student.findMany({
      where: {
        schoolId,
        classId: classroom.id,
        deletedAt: null,
      },
      select: {
        id: true,
        number: true,
        firstName: true,
        lastName: true,
      },
      orderBy: { number: 'asc' },
    });

    if (students.length === 0) {
      throw new ConflictException('Bu sınıfta aktif öğrenci yok.');
    }

    return {
      classId: classroom.id,
      className: classroom.name,
      students,
    };
  }

  private ensureRosterNumbersKnown(
    roster: ActiveClassRoster,
    absentStudentNumbers: number[],
  ) {
    this.ensureSnapshotNumbersKnown(
      roster.students.map((student) => student.number),
      absentStudentNumbers,
      'Girilen devamsız öğrenci numaraları seçilen sınıfın aktif öğrencilerine ait olmalıdır.',
    );
  }

  private ensureSnapshotNumbersKnown(
    availableNumbers: number[],
    absentStudentNumbers: number[],
    message = 'Girilen devamsız öğrenci numarası yoklama snapshot’ında bulunmuyor.',
  ) {
    const available = new Set(availableNumbers);
    const unknownNumbers = absentStudentNumbers.filter(
      (number) => !available.has(number),
    );

    if (unknownNumbers.length > 0) {
      throw new BadRequestException(message);
    }
  }

  private async advanceFinalizationBoundary(
    prisma: Prisma.TransactionClient,
    schoolId: string,
    businessDate: BusinessDate,
    finalizedThroughDate: string | null,
    actor: AttendanceActor,
  ) {
    const nextFinalizedThrough = previousBusinessDate(businessDate);
    const nextFinalizedValue = businessDateValue(nextFinalizedThrough);

    if (
      finalizedThroughDate &&
      finalizedThroughDate >= nextFinalizedValue
    ) {
      return;
    }

    const now = new Date();
    const [lockedAttendances, invalidatedRequests] = await Promise.all([
      prisma.attendance.updateMany({
        where: {
          schoolId,
          lessonDate: { lte: nextFinalizedThrough },
          status: AttendanceStatus.SUBMITTED,
        },
        data: { status: AttendanceStatus.LOCKED },
      }),
      prisma.attendanceEditRequest.updateMany({
        where: {
          attendance: {
            schoolId,
            lessonDate: { lte: nextFinalizedThrough },
          },
          status: {
            in: [
              AttendanceEditRequestStatuses.PENDING,
              AttendanceEditRequestStatuses.APPROVED,
            ],
          },
        },
        data: {
          status: AttendanceEditRequestStatuses.EXPIRED,
          invalidatedAt: now,
        },
      }),
    ]);

    await prisma.school.update({
      where: { id: schoolId },
      data: { attendanceFinalizedThroughDate: nextFinalizedThrough },
    });
    await prisma.auditLog.create({
      data: {
        schoolId,
        actorUserId: actor.userId,
        actorMembershipId: actor.auditMembershipId,
        action: 'ATTENDANCE_FINALIZATION_ADVANCED',
        entityType: 'School',
        entityId: schoolId,
        metadata: {
          previousFinalizedThroughDate: finalizedThroughDate,
          finalizedThroughDate: nextFinalizedValue,
          lockedAttendanceCount: lockedAttendances.count,
          invalidatedEditRequestCount: invalidatedRequests.count,
          triggerLessonDate: businessDate.value,
        },
      },
    });
  }

  private async lockSchoolForAttendance(
    prisma: Prisma.TransactionClient,
    schoolId: string,
  ) {
    const schools = await prisma.$queryRaw<
      Array<{ attendanceFinalizedThroughDate: Date | null }>
    >`
      SELECT "attendanceFinalizedThroughDate"
      FROM "School"
      WHERE "id" = ${schoolId}
        AND "status" = 'ACTIVE'
        AND "deletedAt" IS NULL
      FOR UPDATE
    `;

    if (schools.length === 0) {
      throw new NotFoundException('Aktif okul bulunamadı.');
    }

    return schools[0];
  }

  private async requireCurrentAttendanceActor(
    prisma: Prisma.TransactionClient,
    schoolId: string,
    actor: AttendanceActor,
  ): Promise<AttendanceActor> {
    const memberships = await this.findActivePersonnelMembershipsForUser(
      prisma,
      schoolId,
      actor.userId,
    );
    const adminMembership = memberships.find(
      (membership) => membership.role === MembershipRole.ADMIN,
    );
    const teacherMembership = memberships.find(
      (membership) => membership.role === MembershipRole.TEACHER,
    );
    const auditMembership = adminMembership ?? teacherMembership;

    if (!auditMembership) {
      throw new ForbiddenException('Aktif personel üyeliğiniz bulunmuyor.');
    }

    return {
      userId: actor.userId,
      membershipIds: memberships.map((membership) => membership.id),
      auditMembershipId: auditMembership.id,
      isAdmin: Boolean(adminMembership),
    };
  }

  private async findActivePersonnelMembership(
    prisma: Prisma.TransactionClient,
    schoolId: string,
    membershipId: string,
  ) {
    const memberships = await prisma.$queryRaw<
      Array<{ id: string; role: MembershipRole }>
    >`
      SELECT "id", "role"
      FROM "SchoolMembership"
      WHERE "id" = ${membershipId}
        AND "schoolId" = ${schoolId}
        AND "deletedAt" IS NULL
        AND "role" IN ('ADMIN', 'TEACHER')
      FOR UPDATE
    `;

    return memberships[0] ?? null;
  }

  private async findActivePersonnelMembershipsForUser(
    prisma: Prisma.TransactionClient,
    schoolId: string,
    userId: string,
  ) {
    return prisma.$queryRaw<Array<{ id: string; role: MembershipRole }>>`
      SELECT "id", "role"
      FROM "SchoolMembership"
      WHERE "schoolId" = ${schoolId}
        AND "userId" = ${userId}
        AND "deletedAt" IS NULL
        AND "role" IN ('ADMIN', 'TEACHER')
      FOR UPDATE
    `;
  }

  private requireCurrentAdmin(actor: AttendanceActor) {
    if (!actor.isAdmin) {
      throw new ForbiddenException('Bu işlem için aktif ADMIN üyeliği gerekli.');
    }
  }

  private async requireEditPermissionIfLocked(
    prisma: Prisma.TransactionClient,
    attendance: {
      id: string;
      status: AttendanceStatus;
      submittedByMembershipId: string;
    },
    actor: AttendanceActor,
  ) {
    if (attendance.status === AttendanceStatus.SUBMITTED) {
      if (
        actor.isAdmin ||
        actor.membershipIds.includes(attendance.submittedByMembershipId)
      ) {
        return null;
      }

      throw new ForbiddenException(
        'İnceleme kilidi olmayan yoklamayı yalnız gönderen personel veya yönetici düzeltebilir.',
      );
    }

    const now = new Date();
    await this.expireOpenEditPermissions(prisma, attendance.id, now);
    const editGrant = await prisma.attendanceEditRequest.findFirst({
      where: {
        attendanceId: attendance.id,
        requestedByMembershipId: { in: actor.membershipIds },
        status: AttendanceEditRequestStatuses.APPROVED,
        editExpiresAt: { gt: now },
      },
      select: { id: true },
    });

    if (!editGrant) {
      throw new ConflictException(
        'Bu yoklama inceleme kilitli. Düzenlemek için yönetici onaylı talep gerekir.',
      );
    }

    return editGrant;
  }

  private async expireOpenEditPermissions(
    prisma: Prisma.TransactionClient,
    attendanceId: string,
    now: Date,
  ) {
    await prisma.attendanceEditRequest.updateMany({
      where: {
        attendanceId,
        status: AttendanceEditRequestStatuses.APPROVED,
        editExpiresAt: { lte: now },
      },
      data: {
        status: AttendanceEditRequestStatuses.EXPIRED,
        invalidatedAt: now,
      },
    });
  }

  private lessonPeriodNotFound(
    businessDate: BusinessDate,
    lessonNumber: number,
  ) {
    return new BadRequestException(
      `Bu okul için ${this.dayLabel(businessDate.dayOfWeek)} günü ${lessonNumber}. ders saati tanımlı değil.`,
    );
  }

  private dayLabel(dayOfWeek: BusinessDate['dayOfWeek']): string {
    const labels = {
      MONDAY: 'Pazartesi',
      TUESDAY: 'Salı',
      WEDNESDAY: 'Çarşamba',
      THURSDAY: 'Perşembe',
      FRIDAY: 'Cuma',
      SATURDAY: 'Cumartesi',
      SUNDAY: 'Pazar',
    } as const;

    return labels[dayOfWeek];
  }

  private ensureDateNotFinalized(
    lessonDate: string,
    finalizedThroughDate: string | null,
  ) {
    if (this.isDateFinalized(lessonDate, finalizedThroughDate)) {
      throw new ConflictException(
        'Bu tarih günlük kesinleşme nedeniyle artık değiştirilemez.',
      );
    }
  }

  private isDateFinalized(
    lessonDate: string,
    finalizedThroughDate: string | null,
  ) {
    return Boolean(finalizedThroughDate && lessonDate <= finalizedThroughDate);
  }

  private sameNumbers(left: number[], right: number[]) {
    if (left.length !== right.length) {
      return false;
    }

    const sortedLeft = [...left].sort((first, second) => first - second);
    const sortedRight = [...right].sort((first, second) => first - second);

    return sortedLeft.every((value, index) => value === sortedRight[index]);
  }

  private normalizeReason(value: string, label: string) {
    const normalized = value.trim().replace(/\s+/g, ' ');

    if (normalized.length < 3 || normalized.length > 500) {
      throw new BadRequestException(
        `${label} 3 ile 500 karakter arasında olmalıdır.`,
      );
    }

    return normalized;
  }

  private toSummary(
    attendance: AttendanceSummaryRecord,
    finalizedThroughDate: string | null,
    actor: AttendanceActor,
  ) {
    const lessonDate = businessDateValue(attendance.lessonDate);
    const isFinalized = this.isDateFinalized(lessonDate, finalizedThroughDate);
    const isOriginalSubmitter = actor.membershipIds.includes(
      attendance.submittedByMembershipId,
    );

    const absentSnapshots = attendance.studentSnapshots.filter(
      (snapshot) => snapshot.status === AttendanceStudentStatus.ABSENT,
    );
    const hasOpenEditRequest = this.hasOpenEditRequest(
      attendance.editRequests,
    );

    return {
      id: attendance.id,
      classId: attendance.classId,
      className: attendance.classNameSnapshot,
      lessonDate,
      lessonNumber: attendance.lessonNumber,
      lessonStartMinute: attendance.lessonStartMinuteSnapshot,
      lessonEndMinute: attendance.lessonEndMinuteSnapshot,
      status: attendance.status,
      revision: attendance.revision,
      submittedAt: attendance.submittedAt,
      reviewLockedAt: attendance.reviewLockedAt,
      updatedAt: attendance.updatedAt,
      absentStudentNumbers: absentSnapshots.map(
        (snapshot) => snapshot.studentNumber,
      ),
      absentCount: absentSnapshots.length,
      studentCount: attendance._count.studentSnapshots,
      isFinalized,
      hasOpenEditRequest,
      canEdit:
        !isFinalized &&
        attendance.status === AttendanceStatus.SUBMITTED &&
        (actor.isAdmin || isOriginalSubmitter),
      canRequestEdit:
        !isFinalized &&
        attendance.status === AttendanceStatus.LOCKED &&
        attendance.reviewLockedAt !== null &&
        !hasOpenEditRequest,
      canReviewLock:
        actor.isAdmin &&
        !isFinalized &&
        attendance.status === AttendanceStatus.SUBMITTED,
    };
  }

  private toDetail(
    attendance: AttendanceDetailRecord,
    finalizedThroughDate: string | null,
    actor: AttendanceActor,
  ) {
    const summary = this.toSummary(attendance, finalizedThroughDate, actor);
    const now = new Date();
    const openEditRequests = attendance.editRequests.filter((request) =>
      this.isOpenEditRequest(request, now),
    );
    const activeGrant = openEditRequests.find(
      (request) =>
        request.status === AttendanceEditRequestStatuses.APPROVED &&
        request.editExpiresAt !== null &&
        request.editExpiresAt > now &&
        actor.membershipIds.includes(request.requestedByMembershipId),
    );
    const ownOpenRequest = openEditRequests.find((request) =>
      actor.membershipIds.includes(request.requestedByMembershipId),
    );

    return {
      ...summary,
      canEdit:
        summary.canEdit ||
        Boolean(
          !summary.isFinalized &&
            attendance.status === AttendanceStatus.LOCKED &&
            activeGrant,
        ),
      canRequestEdit:
        summary.canRequestEdit && !activeGrant,
      submittedBy: {
        role: attendance.submittedByMembership.role,
        firstName: attendance.submittedByMembership.user.firstName,
        lastName: attendance.submittedByMembership.user.lastName,
      },
      reviewLockedBy: attendance.reviewLockedByMembership
        ? {
            role: attendance.reviewLockedByMembership.role,
            firstName: attendance.reviewLockedByMembership.user.firstName,
            lastName: attendance.reviewLockedByMembership.user.lastName,
          }
        : null,
      students: attendance.studentSnapshots.map((snapshot) => ({
        number: snapshot.studentNumber,
        firstName: snapshot.firstName,
        lastName: snapshot.lastName,
        status: snapshot.status,
      })),
      editPermissionExpiresAt: activeGrant?.editExpiresAt ?? null,
      ownOpenEditRequest: ownOpenRequest
        ? this.toEditRequest(ownOpenRequest)
        : null,
      pendingEditRequests: actor.isAdmin
        ? attendance.editRequests
            .filter(
              (request) => request.status === AttendanceEditRequestStatuses.PENDING,
            )
            .map((request) => this.toEditRequest(request))
        : undefined,
    };
  }

  private editRequestSelect() {
    return {
      id: true,
      requestedByMembershipId: true,
      reason: true,
      status: true,
      requestedAt: true,
      reviewedAt: true,
      reviewNote: true,
      editGrantedAt: true,
      editExpiresAt: true,
      completedAt: true,
      requestedByMembership: {
        select: {
          role: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    } as const;
  }

  private toEditRequest(
    request: Prisma.AttendanceEditRequestGetPayload<{
      select: ReturnType<AttendanceService['editRequestSelect']>;
    }>,
  ) {
    return {
      id: request.id,
      requestedBy: {
        role: request.requestedByMembership.role,
        firstName: request.requestedByMembership.user.firstName,
        lastName: request.requestedByMembership.user.lastName,
      },
      reason: request.reason,
      status: request.status,
      requestedAt: request.requestedAt,
      reviewedAt: request.reviewedAt,
      reviewNote: request.reviewNote,
      editGrantedAt: request.editGrantedAt,
      editExpiresAt: request.editExpiresAt,
      completedAt: request.completedAt,
    };
  }

  private hasOpenEditRequest(
    requests: Array<{
      status: AttendanceEditRequestStatus;
      editExpiresAt: Date | null;
    }>,
    now = new Date(),
  ) {
    return requests.some((request) => this.isOpenEditRequest(request, now));
  }

  private isOpenEditRequest(
    request: {
      status: AttendanceEditRequestStatus;
      editExpiresAt: Date | null;
    },
    now: Date,
  ) {
    return (
      request.status === AttendanceEditRequestStatuses.PENDING ||
      (request.status === AttendanceEditRequestStatuses.APPROVED &&
        request.editExpiresAt !== null &&
        request.editExpiresAt > now)
    );
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
            'Başka bir yoklama işlemiyle çakıştı. Lütfen tekrar deneyin.',
          );
        }

        throw error;
      }
    }

    throw new ConflictException('Yoklama işlemi tamamlanamadı.');
  }

  private isUniqueConstraintError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
      return false;
    }

    return error.code === 'P2002';
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
