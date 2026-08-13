import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  AttendanceEditRequestStatus,
  AttendanceStatus,
  AttendanceStudentStatus,
  DayOfWeek,
  MembershipRole,
} from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';

interface AttendanceSummaryResponse {
  id: string;
  classId: string;
  lessonDate: string;
  lessonNumber: number;
  status: AttendanceStatus;
  revision: number;
  absentStudentNumbers: number[];
  absentCount: number;
  studentCount: number;
}

describe('Attendance (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
      }),
    );
    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    await app.init();
  });

  afterAll(async () => {
    if (createdSchoolIds.length > 0) {
      await prisma.auditLog
        .deleteMany({ where: { schoolId: { in: createdSchoolIds } } })
        .catch(() => undefined);
      await prisma.school
        .deleteMany({ where: { id: { in: createdSchoolIds } } })
        .catch(() => undefined);
    }

    if (createdUserIds.length > 0) {
      await prisma.user
        .deleteMany({ where: { id: { in: createdUserIds } } })
        .catch(() => undefined);
    }

    await app.close();
  });

  it('keeps attendance snapshots, review locks and daily finalization consistent', async () => {
    const unique = randomInt(1000000, 9999999).toString();
    const admin = await prisma.user.create({
      data: {
        phone: `+90555${unique}`,
        firstName: 'Yoklama',
        lastName: 'Yöneticisi',
      },
    });
    const teacher = await prisma.user.create({
      data: {
        phone: `+90556${unique}`,
        firstName: 'İlk',
        lastName: 'Öğretmen',
      },
    });
    const secondTeacher = await prisma.user.create({
      data: {
        phone: `+90557${unique}`,
        firstName: 'İkinci',
        lastName: 'Öğretmen',
      },
    });
    const parent = await prisma.user.create({
      data: {
        phone: `+90558${unique}`,
        firstName: 'Veli',
        lastName: 'Kullanıcı',
      },
    });
    createdUserIds.push(admin.id, teacher.id, secondTeacher.id, parent.id);

    const school = await prisma.school.create({
      data: {
        code: `ATTENDANCE-${unique}`,
        name: 'Yoklama Okulu',
      },
    });
    const otherSchool = await prisma.school.create({
      data: {
        code: `ATTENDANCE-OTHER-${unique}`,
        name: 'Diğer Yoklama Okulu',
      },
    });
    createdSchoolIds.push(school.id, otherSchool.id);

    const [adminMembership, , secondTeacherMembership] =
      await prisma.$transaction([
        prisma.schoolMembership.create({
          data: {
            schoolId: school.id,
            userId: admin.id,
            role: MembershipRole.ADMIN,
          },
        }),
        prisma.schoolMembership.create({
          data: {
            schoolId: school.id,
            userId: teacher.id,
            role: MembershipRole.TEACHER,
          },
        }),
        prisma.schoolMembership.create({
          data: {
            schoolId: school.id,
            userId: secondTeacher.id,
            role: MembershipRole.TEACHER,
          },
        }),
        prisma.schoolMembership.create({
          data: {
            schoolId: school.id,
            userId: parent.id,
            role: MembershipRole.PARENT,
          },
        }),
        prisma.schoolMembership.create({
          data: {
            schoolId: otherSchool.id,
            userId: admin.id,
            role: MembershipRole.ADMIN,
          },
        }),
      ]);

    const classA = await prisma.class.create({
      data: { schoolId: school.id, name: '9-A' },
    });
    const classB = await prisma.class.create({
      data: { schoolId: school.id, name: '9-B' },
    });
    const [studentA1, studentA2] = await prisma.$transaction([
      prisma.student.create({
        data: {
          schoolId: school.id,
          classId: classA.id,
          number: 1001,
          firstName: 'Ayşe',
          lastName: 'Kaya',
        },
      }),
      prisma.student.create({
        data: {
          schoolId: school.id,
          classId: classA.id,
          number: 1002,
          firstName: 'Ece',
          lastName: 'Yılmaz',
        },
      }),
      prisma.student.create({
        data: {
          schoolId: school.id,
          classId: classB.id,
          number: 2001,
          firstName: 'Mert',
          lastName: 'Demir',
        },
      }),
    ]);
    await prisma.schoolLessonPeriod.createMany({
      data: [
        {
          schoolId: school.id,
          dayOfWeek: DayOfWeek.MONDAY,
          lessonNumber: 1,
          startMinute: 480,
          endMinute: 520,
        },
        {
          schoolId: school.id,
          dayOfWeek: DayOfWeek.TUESDAY,
          lessonNumber: 1,
          startMinute: 480,
          endMinute: 520,
        },
      ],
    });

    const adminToken = await jwtService.signAsync({
      sub: admin.id,
      phone: admin.phone,
    });
    const teacherToken = await jwtService.signAsync({
      sub: teacher.id,
      phone: teacher.phone,
    });
    const secondTeacherToken = await jwtService.signAsync({
      sub: secondTeacher.id,
      phone: secondTeacher.phone,
    });
    const parentToken = await jwtService.signAsync({
      sub: parent.id,
      phone: parent.phone,
    });
    const attendancesUrl = `/schools/${school.id}/attendances`;
    const monday = '2026-08-10';
    const tuesday = '2026-08-11';

    await request(app.getHttpServer())
      .get(`${attendancesUrl}/board?date=${monday}`)
      .expect(401);
    await request(app.getHttpServer())
      .post(attendancesUrl)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        classId: classA.id,
        lessonDate: monday,
        lessonNumber: 1,
        absentStudentNumbers: [],
      })
      .expect(403);

    const entryContextResponse = await request(app.getHttpServer())
      .get(
        `${attendancesUrl}/entry-context?classId=${classA.id}&date=${monday}&lessonNumber=1`,
      )
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    expect(entryContextResponse.body).toMatchObject({
      date: monday,
      class: { id: classA.id, name: '9-A' },
      lessonPeriod: { lessonNumber: 1, startMinute: 480, endMinute: 520 },
      existingAttendanceId: null,
    });
    expect(entryContextResponse.body.students).toEqual([
      expect.objectContaining({ number: 1001, firstName: 'Ayşe' }),
      expect.objectContaining({ number: 1002, firstName: 'Ece' }),
    ]);
    expect(entryContextResponse.body.students[0]).not.toHaveProperty('id');

    await request(app.getHttpServer())
      .post(attendancesUrl)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        classId: classA.id,
        lessonDate: monday,
        lessonNumber: 1,
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(attendancesUrl)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        classId: classA.id,
        lessonDate: monday,
        lessonNumber: 1,
        absentStudentNumbers: Array.from(
          { length: 10_001 },
          (_, index) => index + 1,
        ),
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(attendancesUrl)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        lessonDate: monday,
        lessonNumber: 1,
        absentStudentNumbers: [],
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(attendancesUrl)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        classId: classA.id,
        lessonDate: monday,
        lessonNumber: 1,
        absentStudentNumbers: [2001],
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(attendancesUrl)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        classId: classA.id,
        lessonDate: monday,
        lessonNumber: 2,
        absentStudentNumbers: [],
      })
      .expect(400);

    const mondayResponse = await request(app.getHttpServer())
      .post(attendancesUrl)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        classId: classA.id,
        lessonDate: monday,
        lessonNumber: 1,
        absentStudentNumbers: [],
      })
      .expect(201);
    const mondayAttendance = mondayResponse.body as AttendanceSummaryResponse;
    expect(mondayAttendance).toMatchObject({
      classId: classA.id,
      lessonDate: monday,
      lessonNumber: 1,
      status: AttendanceStatus.SUBMITTED,
      revision: 1,
      absentStudentNumbers: [],
      absentCount: 0,
      studentCount: 2,
    });

    const snapshots = await prisma.attendanceStudentSnapshot.findMany({
      where: { attendanceId: mondayAttendance.id },
      select: { studentNumber: true, firstName: true, status: true },
      orderBy: { studentNumber: 'asc' },
    });
    expect(snapshots).toEqual([
      { studentNumber: 1001, firstName: 'Ayşe', status: AttendanceStudentStatus.PRESENT },
      { studentNumber: 1002, firstName: 'Ece', status: AttendanceStudentStatus.PRESENT },
    ]);

    await request(app.getHttpServer())
      .post(attendancesUrl)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        classId: classA.id,
        lessonDate: monday,
        lessonNumber: 1,
        absentStudentNumbers: [],
      })
      .expect(409);

    const inferredClassResponse = await request(app.getHttpServer())
      .post(attendancesUrl)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        lessonDate: monday,
        lessonNumber: 1,
        absentStudentNumbers: [2001],
      })
      .expect(201);
    expect(inferredClassResponse.body).toMatchObject({
      classId: classB.id,
      absentStudentNumbers: [2001],
    });

    await request(app.getHttpServer())
      .patch(`${attendancesUrl}/${mondayAttendance.id}`)
      .set('Authorization', `Bearer ${secondTeacherToken}`)
      .send({ expectedRevision: 1, absentStudentNumbers: [1002] })
      .expect(403);
    const revisedResponse = await request(app.getHttpServer())
      .patch(`${attendancesUrl}/${mondayAttendance.id}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ expectedRevision: 1, absentStudentNumbers: [1002] })
      .expect(200);
    expect(revisedResponse.body).toMatchObject({
      revision: 2,
      absentStudentNumbers: [1002],
      absentCount: 1,
    });
    await request(app.getHttpServer())
      .patch(`${attendancesUrl}/${mondayAttendance.id}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ expectedRevision: 1, absentStudentNumbers: [] })
      .expect(409);

    await request(app.getHttpServer())
      .post(`${attendancesUrl}/${mondayAttendance.id}/review-lock`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(403);
    const lockedResponse = await request(app.getHttpServer())
      .post(`${attendancesUrl}/${mondayAttendance.id}/review-lock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(lockedResponse.body).toMatchObject({ status: AttendanceStatus.LOCKED });

    const editRequestResponse = await request(app.getHttpServer())
      .post(`${attendancesUrl}/${mondayAttendance.id}/edit-requests`)
      .set('Authorization', `Bearer ${secondTeacherToken}`)
      .send({ reason: 'Numara sehven eksik işaretlendi.' })
      .expect(201);
    const inactiveEditRequestId = editRequestResponse.body.id as string;
    await request(app.getHttpServer())
      .post(`${attendancesUrl}/${mondayAttendance.id}/edit-requests`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ reason: 'İkinci bir talep.' })
      .expect(409);
    await prisma.schoolMembership.update({
      where: { id: secondTeacherMembership.id },
      data: { deletedAt: new Date() },
    });
    await request(app.getHttpServer())
      .post(
        `${attendancesUrl}/${mondayAttendance.id}/edit-requests/${inactiveEditRequestId}/approve`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'Üyelik kapanmış olduğu için izin verilemez.' })
      .expect(409);
    expect(
      await prisma.attendanceEditRequest.findUniqueOrThrow({
        where: { id: inactiveEditRequestId },
        select: { status: true, invalidatedAt: true },
      }),
    ).toMatchObject({
      status: AttendanceEditRequestStatus.EXPIRED,
      invalidatedAt: expect.any(Date),
    });
    await prisma.schoolMembership.update({
      where: { id: secondTeacherMembership.id },
      data: { deletedAt: null },
    });

    const replacementEditRequestResponse = await request(app.getHttpServer())
      .post(`${attendancesUrl}/${mondayAttendance.id}/edit-requests`)
      .set('Authorization', `Bearer ${secondTeacherToken}`)
      .send({ reason: 'Doğru numara tekrar kontrol edildi.' })
      .expect(201);
    const editRequestId = replacementEditRequestResponse.body.id as string;
    await request(app.getHttpServer())
      .patch(`${attendancesUrl}/${mondayAttendance.id}`)
      .set('Authorization', `Bearer ${secondTeacherToken}`)
      .send({ expectedRevision: 2, absentStudentNumbers: [] })
      .expect(409);

    const requestsResponse = await request(app.getHttpServer())
      .get(`${attendancesUrl}/${mondayAttendance.id}/edit-requests`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(requestsResponse.body).toEqual([
      expect.objectContaining({
        id: editRequestId,
        status: AttendanceEditRequestStatus.PENDING,
      }),
    ]);
    expect(requestsResponse.body[0]).not.toHaveProperty(
      'requestedByMembershipId',
    );

    const approvedResponse = await request(app.getHttpServer())
      .post(`${attendancesUrl}/${mondayAttendance.id}/edit-requests/${editRequestId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'Tek seferlik düzeltme izni verildi.' })
      .expect(201);
    expect(approvedResponse.body).toMatchObject({
      id: editRequestId,
      status: AttendanceEditRequestStatus.APPROVED,
    });
    expect(approvedResponse.body.editExpiresAt).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .patch(`${attendancesUrl}/${mondayAttendance.id}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ expectedRevision: 2, absentStudentNumbers: [] })
      .expect(409);
    const grantedRevision = await request(app.getHttpServer())
      .patch(`${attendancesUrl}/${mondayAttendance.id}`)
      .set('Authorization', `Bearer ${secondTeacherToken}`)
      .send({ expectedRevision: 2, absentStudentNumbers: [] })
      .expect(200);
    expect(grantedRevision.body).toMatchObject({
      revision: 3,
      absentStudentNumbers: [],
    });
    expect(
      await prisma.attendanceEditRequest.findUniqueOrThrow({
        where: { id: editRequestId },
        select: { status: true, completedAt: true },
      }),
    ).toMatchObject({
      status: AttendanceEditRequestStatus.COMPLETED,
      completedAt: expect.any(Date),
    });
    await prisma.attendanceEditRequest.create({
      data: {
        attendanceId: mondayAttendance.id,
        requestedByMembershipId: secondTeacherMembership.id,
        reason: 'Süresi dolmuş düzenleme izni.',
        status: AttendanceEditRequestStatus.APPROVED,
        reviewedByMembershipId: adminMembership.id,
        reviewedAt: new Date(),
        editGrantedAt: new Date(Date.now() - 16 * 60 * 1000),
        editExpiresAt: new Date(Date.now() - 60 * 1000),
      },
    });
    const expiredGrantDetail = await request(app.getHttpServer())
      .get(`${attendancesUrl}/${mondayAttendance.id}`)
      .set('Authorization', `Bearer ${secondTeacherToken}`)
      .expect(200);
    expect(expiredGrantDetail.body).toMatchObject({
      hasOpenEditRequest: false,
      canRequestEdit: true,
      ownOpenEditRequest: null,
    });
    expect(expiredGrantDetail.body.submittedBy).not.toHaveProperty(
      'membershipId',
    );
    const expiredGrantRequests = await request(app.getHttpServer())
      .get(`${attendancesUrl}/${mondayAttendance.id}/edit-requests`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(expiredGrantRequests.body).toEqual([]);
    await request(app.getHttpServer())
      .patch(`${attendancesUrl}/${mondayAttendance.id}`)
      .set('Authorization', `Bearer ${secondTeacherToken}`)
      .send({ expectedRevision: 3, absentStudentNumbers: [1001] })
      .expect(409);

    await prisma.student.update({
      where: { id: studentA1.id },
      data: { firstName: 'Yeni Ayşe', classId: classB.id },
    });
    await prisma.schoolLessonPeriod.update({
      where: {
        schoolId_dayOfWeek_lessonNumber: {
          schoolId: school.id,
          dayOfWeek: DayOfWeek.MONDAY,
          lessonNumber: 1,
        },
      },
      data: { startMinute: 500, endMinute: 540 },
    });
    const detailResponse = await request(app.getHttpServer())
      .get(`${attendancesUrl}/${mondayAttendance.id}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    expect(detailResponse.body).toMatchObject({
      lessonStartMinute: 480,
      lessonEndMinute: 520,
      absentStudentNumbers: [],
      absentCount: 0,
      students: expect.arrayContaining([
        expect.objectContaining({ number: 1001, firstName: 'Ayşe' }),
      ]),
    });
    expect(detailResponse.body.reviewLockedBy).not.toHaveProperty('membershipId');

    const tuesdayResponse = await request(app.getHttpServer())
      .post(attendancesUrl)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        classId: classB.id,
        lessonDate: tuesday,
        lessonNumber: 1,
        absentStudentNumbers: [],
      })
      .expect(201);
    expect(tuesdayResponse.body).toMatchObject({ lessonDate: tuesday });

    const schoolAfterFinalization = await prisma.school.findUniqueOrThrow({
      where: { id: school.id },
      select: { attendanceFinalizedThroughDate: true },
    });
    expect(schoolAfterFinalization.attendanceFinalizedThroughDate?.toISOString()).toContain(
      monday,
    );
    expect(
      await prisma.attendance.findUniqueOrThrow({
        where: { id: mondayAttendance.id },
        select: { status: true },
      }),
    ).toEqual({ status: AttendanceStatus.LOCKED });
    await request(app.getHttpServer())
      .post(attendancesUrl)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        classId: classB.id,
        lessonDate: monday,
        lessonNumber: 1,
        absentStudentNumbers: [],
      })
      .expect(409);
    await request(app.getHttpServer())
      .post(attendancesUrl)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        classId: classA.id,
        lessonDate: tuesday,
        lessonNumber: 1,
        absentStudentNumbers: [],
      })
      .expect(201);

    const boardResponse = await request(app.getHttpServer())
      .get(`${attendancesUrl}/board?date=${tuesday}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    expect(boardResponse.body).toMatchObject({
      date: tuesday,
      finalizedThroughDate: monday,
      isFinalized: false,
    });
    expect(boardResponse.body.attendances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ classId: classA.id, lessonNumber: 1 }),
        expect.objectContaining({ classId: classB.id, lessonNumber: 1 }),
      ]),
    );

    await request(app.getHttpServer())
      .get(
        `/schools/${otherSchool.id}/attendances/${mondayAttendance.id}`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(attendancesUrl)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        classId: classA.id,
        lessonDate: '9999-12-31',
        lessonNumber: 1,
        absentStudentNumbers: [],
      })
      .expect(400);

    const auditActions = await prisma.auditLog.findMany({
      where: { schoolId: school.id, entityId: mondayAttendance.id },
      select: { action: true, actorUserId: true, actorMembershipId: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(auditActions).toEqual(
      expect.arrayContaining([
        {
          action: 'ATTENDANCE_SUBMITTED',
          actorUserId: teacher.id,
          actorMembershipId: expect.any(String),
        },
        {
          action: 'ATTENDANCE_REVIEW_LOCKED',
          actorUserId: admin.id,
          actorMembershipId: adminMembership.id,
        },
        {
          action: 'ATTENDANCE_ABSENCES_UPDATED',
          actorUserId: secondTeacher.id,
          actorMembershipId: expect.any(String),
        },
      ]),
    );
  });
});
