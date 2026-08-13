import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { MembershipRole } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';

interface ClassSummaryResponse {
  id: string;
  name: string;
  deletedAt: string | null;
  studentCount: number;
}

describe('Classes (e2e)', () => {
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

  it('lets an ADMIN manage active and archived classes only inside their school', async () => {
    const unique = randomInt(1000000, 9999999).toString();
    const admin = await prisma.user.create({
      data: {
        phone: `+90555${unique}`,
        firstName: 'Sınıf',
        lastName: 'Yöneticisi',
      },
    });
    const teacher = await prisma.user.create({
      data: {
        phone: `+90556${unique}`,
        firstName: 'Sınıf',
        lastName: 'Öğretmeni',
      },
    });
    createdUserIds.push(admin.id, teacher.id);

    const school = await prisma.school.create({
      data: {
        code: `CLASS-${unique}`,
        name: 'Sınıf Okulu',
      },
    });
    const otherSchool = await prisma.school.create({
      data: {
        code: `CLASS-OTHER-${unique}`,
        name: 'Diğer Sınıf Okulu',
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

    const otherClass = await prisma.class.create({
      data: {
        schoolId: otherSchool.id,
        name: 'Diğer 9A',
      },
    });

    const adminToken = await jwtService.signAsync({
      sub: admin.id,
      phone: admin.phone,
    });
    const teacherToken = await jwtService.signAsync({
      sub: teacher.id,
      phone: teacher.phone,
    });
    const classesUrl = `/schools/${school.id}/classes`;

    await request(app.getHttpServer()).get(classesUrl).expect(401);
    await request(app.getHttpServer())
      .post(classesUrl)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: '9 A' })
      .expect(403);

    await request(app.getHttpServer())
      .post(classesUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: ' '.repeat(81) })
      .expect(400);

    await request(app.getHttpServer())
      .get(classesUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect([]);

    const createdResponse = await request(app.getHttpServer())
      .post(classesUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '  9 A  ' })
      .expect(201);
    const created = createdResponse.body as ClassSummaryResponse;

    expect(created).toMatchObject({
      name: '9 A',
      deletedAt: null,
      studentCount: 0,
    });

    await request(app.getHttpServer())
      .post(classesUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '9 A' })
      .expect(409);

    const updatedResponse = await request(app.getHttpServer())
      .patch(`${classesUrl}/${created.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '9-B' })
      .expect(200);
    expect(updatedResponse.body).toMatchObject({
      id: created.id,
      name: '9-B',
      deletedAt: null,
    });

    await request(app.getHttpServer())
      .patch(`${classesUrl}/${otherClass.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Sızmamalı' })
      .expect(404);

    const archivedResponse = await request(app.getHttpServer())
      .delete(`${classesUrl}/${created.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(archivedResponse.body).toMatchObject({
      id: created.id,
      name: '9-B',
      studentCount: 0,
    });
    expect(archivedResponse.body.deletedAt).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .get(classesUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect([]);

    const archivedListResponse = await request(app.getHttpServer())
      .get(`${classesUrl}?status=archived`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(archivedListResponse.body).toEqual([
      expect.objectContaining({
        id: created.id,
        name: '9-B',
        studentCount: 0,
      }),
    ]);

    await request(app.getHttpServer())
      .post(classesUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '9-B' })
      .expect(409);

    const restoredResponse = await request(app.getHttpServer())
      .post(`${classesUrl}/${created.id}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(restoredResponse.body).toMatchObject({
      id: created.id,
      name: '9-B',
      deletedAt: null,
      studentCount: 0,
    });

    const protectedClass = await prisma.class.create({
      data: {
        schoolId: school.id,
        name: '10-A',
      },
    });
    await prisma.student.create({
      data: {
        schoolId: school.id,
        classId: protectedClass.id,
        number: randomInt(100000, 999999),
        firstName: 'Aktif',
        lastName: 'Öğrenci',
      },
    });

    await request(app.getHttpServer())
      .delete(`${classesUrl}/${protectedClass.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);

    await request(app.getHttpServer())
      .get(`${classesUrl}?status=bilinmiyor`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        schoolId: school.id,
        entityId: created.id,
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
        action: 'CLASS_CREATED',
        actorUserId: admin.id,
        actorMembershipId: adminMembership.id,
      },
      {
        action: 'CLASS_UPDATED',
        actorUserId: admin.id,
        actorMembershipId: adminMembership.id,
      },
      {
        action: 'CLASS_ARCHIVED',
        actorUserId: admin.id,
        actorMembershipId: adminMembership.id,
      },
      {
        action: 'CLASS_RESTORED',
        actorUserId: admin.id,
        actorMembershipId: adminMembership.id,
      },
    ]);
  });
});
