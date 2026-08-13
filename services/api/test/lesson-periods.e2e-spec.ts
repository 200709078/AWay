import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DayOfWeek, MembershipRole } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';

interface LessonPeriodResponse {
  id: string;
  dayOfWeek: DayOfWeek;
  lessonNumber: number;
  startMinute: number;
  endMinute: number;
}

describe('Lesson periods (e2e)', () => {
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

  it('lets an ADMIN manage a school schedule without overlapping lesson times', async () => {
    const unique = randomInt(1000000, 9999999).toString();
    const admin = await prisma.user.create({
      data: {
        phone: `+90555${unique}`,
        firstName: 'Ders',
        lastName: 'Yöneticisi',
      },
    });
    const teacher = await prisma.user.create({
      data: {
        phone: `+90556${unique}`,
        firstName: 'Ders',
        lastName: 'Öğretmeni',
      },
    });
    createdUserIds.push(admin.id, teacher.id);

    const school = await prisma.school.create({
      data: {
        code: `PERIOD-${unique}`,
        name: 'Ders Saati Okulu',
      },
    });
    const otherSchool = await prisma.school.create({
      data: {
        code: `PERIOD-OTHER-${unique}`,
        name: 'Diğer Ders Saati Okulu',
      },
    });
    createdSchoolIds.push(school.id, otherSchool.id);

    const [adminMembership] = await prisma.$transaction([
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
          schoolId: otherSchool.id,
          userId: admin.id,
          role: MembershipRole.ADMIN,
        },
      }),
    ]);

    const adminToken = await jwtService.signAsync({
      sub: admin.id,
      phone: admin.phone,
    });
    const teacherToken = await jwtService.signAsync({
      sub: teacher.id,
      phone: teacher.phone,
    });
    const lessonPeriodsUrl = `/schools/${school.id}/lesson-periods`;

    await request(app.getHttpServer()).get(lessonPeriodsUrl).expect(401);
    await request(app.getHttpServer())
      .post(lessonPeriodsUrl)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        dayOfWeek: DayOfWeek.MONDAY,
        lessonNumber: 1,
        startMinute: 480,
        endMinute: 510,
      })
      .expect(403);
    await request(app.getHttpServer())
      .post(lessonPeriodsUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        dayOfWeek: DayOfWeek.MONDAY,
        lessonNumber: 1,
        startMinute: 510,
        endMinute: 510,
      })
      .expect(400);

    const firstResponse = await request(app.getHttpServer())
      .post(lessonPeriodsUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        dayOfWeek: DayOfWeek.MONDAY,
        lessonNumber: 1,
        startMinute: 480,
        endMinute: 510,
      })
      .expect(201);
    const first = firstResponse.body as LessonPeriodResponse;
    expect(first).toMatchObject({
      dayOfWeek: DayOfWeek.MONDAY,
      lessonNumber: 1,
      startMinute: 480,
      endMinute: 510,
    });

    const secondResponse = await request(app.getHttpServer())
      .post(lessonPeriodsUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        dayOfWeek: DayOfWeek.MONDAY,
        lessonNumber: 2,
        startMinute: 510,
        endMinute: 550,
      })
      .expect(201);
    const second = secondResponse.body as LessonPeriodResponse;

    await request(app.getHttpServer())
      .post(lessonPeriodsUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        dayOfWeek: DayOfWeek.MONDAY,
        lessonNumber: 3,
        startMinute: 495,
        endMinute: 525,
      })
      .expect(409);
    await request(app.getHttpServer())
      .post(lessonPeriodsUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        dayOfWeek: DayOfWeek.MONDAY,
        lessonNumber: 1,
        startMinute: 600,
        endMinute: 640,
      })
      .expect(409);

    const updatedResponse = await request(app.getHttpServer())
      .patch(`${lessonPeriodsUrl}/${first.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ endMinute: 500 })
      .expect(200);
    expect(updatedResponse.body).toMatchObject({
      id: first.id,
      dayOfWeek: DayOfWeek.MONDAY,
      lessonNumber: 1,
      startMinute: 480,
      endMinute: 500,
    });

    const tuesdayResponse = await request(app.getHttpServer())
      .post(lessonPeriodsUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        dayOfWeek: DayOfWeek.TUESDAY,
        lessonNumber: 1,
        startMinute: 480,
        endMinute: 520,
      })
      .expect(201);
    expect(tuesdayResponse.body).toMatchObject({
      dayOfWeek: DayOfWeek.TUESDAY,
      lessonNumber: 1,
    });

    await request(app.getHttpServer())
      .post(lessonPeriodsUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        dayOfWeek: DayOfWeek.SATURDAY,
        lessonNumber: 100,
        startMinute: 480,
        endMinute: 520,
      })
      .expect(201);

    const otherPeriod = await prisma.schoolLessonPeriod.create({
      data: {
        schoolId: otherSchool.id,
        dayOfWeek: DayOfWeek.MONDAY,
        lessonNumber: 1,
        startMinute: 480,
        endMinute: 520,
      },
    });
    await request(app.getHttpServer())
      .patch(`${lessonPeriodsUrl}/${otherPeriod.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ endMinute: 530 })
      .expect(404);

    const concurrentResponses = await Promise.all([
      request(app.getHttpServer())
        .post(lessonPeriodsUrl)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          dayOfWeek: DayOfWeek.MONDAY,
          lessonNumber: 10,
          startMinute: 700,
          endMinute: 730,
        }),
      request(app.getHttpServer())
        .post(lessonPeriodsUrl)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          dayOfWeek: DayOfWeek.MONDAY,
          lessonNumber: 11,
          startMinute: 710,
          endMinute: 740,
        }),
    ]);
    expect(concurrentResponses.map((response) => response.status).sort()).toEqual([
      201,
      409,
    ]);

    const mondayListResponse = await request(app.getHttpServer())
      .get(`${lessonPeriodsUrl}?dayOfWeek=${DayOfWeek.MONDAY}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(mondayListResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: first.id, lessonNumber: 1 }),
        expect.objectContaining({ id: second.id, lessonNumber: 2 }),
      ]),
    );

    const deletedResponse = await request(app.getHttpServer())
      .delete(`${lessonPeriodsUrl}/${first.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(deletedResponse.body).toEqual(
      expect.objectContaining({ id: first.id, endMinute: 500 }),
    );
    await request(app.getHttpServer())
      .get(`${lessonPeriodsUrl}?dayOfWeek=${DayOfWeek.MONDAY}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).not.toEqual(
          expect.arrayContaining([expect.objectContaining({ id: first.id })]),
        );
      });

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        schoolId: school.id,
        entityId: first.id,
      },
      select: {
        action: true,
        actorUserId: true,
        actorMembershipId: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(auditLogs).toEqual([
      {
        action: 'LESSON_PERIOD_CREATED',
        actorUserId: admin.id,
        actorMembershipId: adminMembership.id,
      },
      {
        action: 'LESSON_PERIOD_UPDATED',
        actorUserId: admin.id,
        actorMembershipId: adminMembership.id,
      },
      {
        action: 'LESSON_PERIOD_DELETED',
        actorUserId: admin.id,
        actorMembershipId: adminMembership.id,
      },
    ]);
  });
});
