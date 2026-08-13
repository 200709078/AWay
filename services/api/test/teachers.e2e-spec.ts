import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { MembershipRole } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';

interface TeacherSummaryResponse {
  id: string;
  firstName: string;
  lastName: string;
  deletedAt: string | null;
  account: {
    status: 'UNVERIFIED' | 'VERIFIED';
    phoneMasked: string;
  };
}

interface TeacherListResponse {
  items: TeacherSummaryResponse[];
  page: number;
  pageSize: number;
  total: number;
}

describe('Teachers (e2e)', () => {
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

  it('lets an ADMIN provision, archive, and restore school-scoped teachers safely', async () => {
    const unique = randomInt(1000000, 9999999).toString();
    const admin = await prisma.user.create({
      data: {
        phone: `+90555${unique}`,
        firstName: 'Öğretmen',
        lastName: 'Yöneticisi',
      },
    });
    const existingAccount = await prisma.user.create({
      data: {
        phone: `+90556${unique}`,
        firstName: 'Mevcut',
        lastName: 'Hesap',
        phoneVerifiedAt: new Date('2026-08-10T09:00:00.000Z'),
      },
    });
    const parent = await prisma.user.create({
      data: {
        phone: `+90557${unique}`,
        firstName: 'Veli',
        lastName: 'Kullanıcı',
      },
    });
    createdUserIds.push(admin.id, existingAccount.id, parent.id);

    const school = await prisma.school.create({
      data: {
        code: `TEACHER-${unique}`,
        name: 'Öğretmen Okulu',
      },
    });
    const otherSchool = await prisma.school.create({
      data: {
        code: `TEACHER-OTHER-${unique}`,
        name: 'Diğer Öğretmen Okulu',
      },
    });
    createdSchoolIds.push(school.id, otherSchool.id);

    const [adminMembership, archivedTeacher, otherTeacher] =
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
            userId: existingAccount.id,
            role: MembershipRole.TEACHER,
            deletedAt: new Date('2026-08-11T09:00:00.000Z'),
          },
        }),
        prisma.schoolMembership.create({
          data: {
            schoolId: otherSchool.id,
            userId: existingAccount.id,
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
      ]);

    const adminToken = await jwtService.signAsync({
      sub: admin.id,
      phone: admin.phone,
    });
    const parentToken = await jwtService.signAsync({
      sub: parent.id,
      phone: parent.phone,
    });
    const teachersUrl = `/schools/${school.id}/teachers`;

    await request(app.getHttpServer()).get(teachersUrl).expect(401);
    await request(app.getHttpServer())
      .post(teachersUrl)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({
        firstName: 'Yetkisiz',
        lastName: 'Deneme',
        phone: `0530${unique}`,
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(teachersUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Geçersiz',
        lastName: 'Telefon',
        phone: 'not-a-phone',
      })
      .expect(400);

    const newTeacherPhone = `0532${unique}`;
    const createdResponse = await request(app.getHttpServer())
      .post(teachersUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: '  Ayşe ',
        lastName: '  Yılmaz  ',
        phone: newTeacherPhone,
        role: MembershipRole.ADMIN,
        userId: admin.id,
        schoolId: otherSchool.id,
      })
      .expect(201);
    const createdTeacher = createdResponse.body as TeacherSummaryResponse;
    expect(createdTeacher).toMatchObject({
      firstName: 'Ayşe',
      lastName: 'Yılmaz',
      deletedAt: null,
      account: {
        status: 'UNVERIFIED',
        phoneMasked: `+90 532 ••• •• ${unique.slice(-2)}`,
      },
    });
    expect(JSON.stringify(createdTeacher)).not.toContain(`+90532${unique}`);

    const createdUser = await prisma.user.findUniqueOrThrow({
      where: { phone: `+90532${unique}` },
    });
    createdUserIds.push(createdUser.id);
    expect(createdUser).toMatchObject({
      firstName: 'Ayşe',
      lastName: 'Yılmaz',
      phoneVerifiedAt: null,
    });

    await request(app.getHttpServer())
      .post(teachersUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Farklı',
        lastName: 'Yerel İsim',
        phone: newTeacherPhone,
      })
      .expect(409);

    const dualRoleResponse = await request(app.getHttpServer())
      .post(teachersUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Değiştirilmemeli',
        lastName: 'Kimlik',
        phone: admin.phone,
      })
      .expect(201);
    const dualRoleTeacherId = dualRoleResponse.body.id as string;
    expect(dualRoleResponse.body).toMatchObject({
      firstName: admin.firstName,
      lastName: admin.lastName,
    });
    await request(app.getHttpServer())
      .delete(`${teachersUrl}/${dualRoleTeacherId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/schools/${school.id}/attendances/board?date=2026-08-10`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(teachersUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Yerel',
        lastName: 'İsim',
        phone: existingAccount.phone,
      })
      .expect(409);

    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: existingAccount.id } }),
    ).toMatchObject({
      firstName: 'Mevcut',
      lastName: 'Hesap',
      phoneVerifiedAt: new Date('2026-08-10T09:00:00.000Z'),
    });

    const activeListResponse = await request(app.getHttpServer())
      .get(`${teachersUrl}?q=Ayşe&page=1&pageSize=1`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(activeListResponse.body as TeacherListResponse).toEqual({
      items: [expect.objectContaining({ id: createdTeacher.id })],
      page: 1,
      pageSize: 1,
      total: 1,
    });

    const archivedListResponse = await request(app.getHttpServer())
      .get(`${teachersUrl}?status=archived`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((archivedListResponse.body as TeacherListResponse).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: archivedTeacher.id,
          firstName: 'Mevcut',
          lastName: 'Hesap',
          account: {
            status: 'VERIFIED',
            phoneMasked: `+90 556 ••• •• ${unique.slice(-2)}`,
          },
        }),
      ]),
    );

    await request(app.getHttpServer())
      .post(`${teachersUrl}/${archivedTeacher.id}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      await prisma.schoolMembership.findUniqueOrThrow({
        where: { id: archivedTeacher.id },
      }),
    ).toMatchObject({ deletedAt: null });

    await request(app.getHttpServer())
      .post(teachersUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Yinelenen',
        lastName: 'Öğretmen',
        phone: existingAccount.phone,
      })
      .expect(409);

    const archiveResponse = await request(app.getHttpServer())
      .delete(`${teachersUrl}/${createdTeacher.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(archiveResponse.body).toMatchObject({
      id: createdTeacher.id,
      deletedAt: expect.any(String),
    });

    const createdTeacherToken = await jwtService.signAsync({
      sub: createdUser.id,
      phone: createdUser.phone,
    });
    await request(app.getHttpServer())
      .get(`/schools/${school.id}/attendances/board?date=2026-08-10`)
      .set('Authorization', `Bearer ${createdTeacherToken}`)
      .expect(403);

    const unrelatedMembership = await prisma.schoolMembership.findUniqueOrThrow(
      {
        where: {
          schoolId_userId_role: {
            schoolId: school.id,
            userId: parent.id,
            role: MembershipRole.PARENT,
          },
        },
      },
    );
    expect(unrelatedMembership.deletedAt).toBeNull();

    await request(app.getHttpServer())
      .delete(`${teachersUrl}/${createdTeacher.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);

    await request(app.getHttpServer())
      .delete(`${teachersUrl}/${otherTeacher.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    const restoredResponse = await request(app.getHttpServer())
      .post(`${teachersUrl}/${createdTeacher.id}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(restoredResponse.body).toMatchObject({
      id: createdTeacher.id,
      deletedAt: null,
    });
    await request(app.getHttpServer())
      .get(`/schools/${school.id}/attendances/board?date=2026-08-10`)
      .set('Authorization', `Bearer ${createdTeacherToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`${teachersUrl}/${createdTeacher.id}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);

    await request(app.getHttpServer())
      .get(`${teachersUrl}?status=invalid`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        schoolId: school.id,
        entityType: 'SchoolMembership',
      },
      select: {
        action: true,
        actorUserId: true,
        actorMembershipId: true,
        metadata: true,
      },
    });
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'TEACHER_CREATED',
          actorUserId: admin.id,
          actorMembershipId: adminMembership.id,
        }),
        expect.objectContaining({
          action: 'TEACHER_ARCHIVED',
          actorUserId: admin.id,
          actorMembershipId: adminMembership.id,
        }),
        expect.objectContaining({
          action: 'TEACHER_RESTORED',
          actorUserId: admin.id,
          actorMembershipId: adminMembership.id,
        }),
      ]),
    );
    expect(JSON.stringify(auditLogs)).not.toContain(existingAccount.phone);
    expect(JSON.stringify(auditLogs)).not.toContain(`+90532${unique}`);
  });
});
