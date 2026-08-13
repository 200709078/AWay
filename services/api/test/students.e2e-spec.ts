import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { MembershipRole } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';

interface StudentSummaryResponse {
  id: string;
  number: number;
  firstName: string;
  lastName: string;
  class: {
    id: string;
    name: string;
  };
  deletedAt: string | null;
  account: {
    status: 'NOT_PROVISIONED' | 'UNVERIFIED' | 'VERIFIED';
    phoneMasked?: string;
  };
}

interface StudentListResponse {
  items: StudentSummaryResponse[];
  page: number;
  pageSize: number;
  total: number;
}

describe('Students (e2e)', () => {
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

  it('lets an ADMIN manage school-scoped students and optional phone accounts safely', async () => {
    const unique = randomInt(1000000, 9999999).toString();
    const admin = await prisma.user.create({
      data: {
        phone: `+90555${unique}`,
        firstName: 'Öğrenci',
        lastName: 'Yöneticisi',
      },
    });
    const teacher = await prisma.user.create({
      data: {
        phone: `+90556${unique}`,
        firstName: 'Öğrenci',
        lastName: 'Öğretmeni',
      },
    });
    const existingAccount = await prisma.user.create({
      data: {
        phone: `+90557${unique}`,
        firstName: 'Mevcut',
        lastName: 'Hesap',
        phoneVerifiedAt: new Date('2026-08-10T09:00:00.000Z'),
      },
    });
    createdUserIds.push(admin.id, teacher.id, existingAccount.id);

    const school = await prisma.school.create({
      data: {
        code: `STUDENT-${unique}`,
        name: 'Öğrenci Okulu',
      },
    });
    const otherSchool = await prisma.school.create({
      data: {
        code: `STUDENT-OTHER-${unique}`,
        name: 'Diğer Öğrenci Okulu',
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
          schoolId: school.id,
          userId: existingAccount.id,
          role: MembershipRole.PARENT,
        },
      }),
    ]);

    const activeClass = await prisma.class.create({
      data: {
        schoolId: school.id,
        name: '9-A',
      },
    });
    const secondClass = await prisma.class.create({
      data: {
        schoolId: school.id,
        name: '9-B',
      },
    });
    const archivedClass = await prisma.class.create({
      data: {
        schoolId: school.id,
        name: 'Arşiv Sınıfı',
        deletedAt: new Date(),
      },
    });
    const otherClass = await prisma.class.create({
      data: {
        schoolId: otherSchool.id,
        name: 'Diğer 9-A',
      },
    });
    const otherStudent = await prisma.student.create({
      data: {
        schoolId: otherSchool.id,
        classId: otherClass.id,
        number: 1001,
        firstName: 'Diğer',
        lastName: 'Öğrenci',
      },
    });
    await prisma.student.create({
      data: {
        schoolId: school.id,
        classId: activeClass.id,
        number: 7777,
        firstName: 'Eski',
        lastName: 'Öğrenci',
        deletedAt: new Date(),
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
    const studentsUrl = `/schools/${school.id}/students`;

    await request(app.getHttpServer()).get(studentsUrl).expect(401);
    await request(app.getHttpServer())
      .post(studentsUrl)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        classId: activeClass.id,
        number: 1001,
        firstName: 'Yetkisiz',
        lastName: 'Deneme',
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(studentsUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        classId: otherClass.id,
        number: 1001,
        firstName: 'Sızmamalı',
        lastName: 'Öğrenci',
      })
      .expect(404);

    await request(app.getHttpServer())
      .post(studentsUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        classId: activeClass.id,
        number: 0,
        firstName: 'Geçersiz',
        lastName: 'Numara',
      })
      .expect(400);

    const plainResponse = await request(app.getHttpServer())
      .post(studentsUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        classId: activeClass.id,
        number: 1001,
        firstName: '  Ayşe  ',
        lastName: '  Kaya  ',
        userId: existingAccount.id,
        schoolId: otherSchool.id,
        role: MembershipRole.ADMIN,
      })
      .expect(201);
    const plainStudent = plainResponse.body as StudentSummaryResponse;
    expect(plainStudent).toMatchObject({
      number: 1001,
      firstName: 'Ayşe',
      lastName: 'Kaya',
      class: { id: activeClass.id, name: activeClass.name },
      deletedAt: null,
      account: { status: 'NOT_PROVISIONED' },
    });

    const provisionedPhone = `0542${unique}`;
    const provisionedResponse = await request(app.getHttpServer())
      .post(studentsUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        classId: activeClass.id,
        number: 1002,
        firstName: 'Ece',
        lastName: 'Yılmaz',
        phone: provisionedPhone,
      })
      .expect(201);
    const provisionedStudent = provisionedResponse.body as StudentSummaryResponse;
    expect(provisionedStudent.account).toEqual({
      status: 'UNVERIFIED',
      phoneMasked: `+90 542 ••• •• ${unique.slice(-2)}`,
    });

    const provisionedUser = await prisma.user.findUniqueOrThrow({
      where: { phone: `+90542${unique}` },
    });
    createdUserIds.push(provisionedUser.id);
    const provisionedMembership = await prisma.schoolMembership.findUniqueOrThrow(
      {
        where: {
          schoolId_userId_role: {
            schoolId: school.id,
            userId: provisionedUser.id,
            role: MembershipRole.STUDENT,
          },
        },
      },
    );
    expect(provisionedUser).toMatchObject({
      firstName: 'Ece',
      lastName: 'Yılmaz',
      phoneVerifiedAt: null,
    });
    expect(provisionedMembership.deletedAt).toBeNull();

    const existingResponse = await request(app.getHttpServer())
      .post(studentsUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        classId: activeClass.id,
        number: 1003,
        firstName: 'Yerel',
        lastName: 'İsim',
        phone: existingAccount.phone,
      })
      .expect(201);
    const existingStudent = existingResponse.body as StudentSummaryResponse;
    expect(existingStudent.account).toEqual({
      status: 'VERIFIED',
      phoneMasked: `+90 557 ••• •• ${unique.slice(-2)}`,
    });
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: existingAccount.id } }),
    ).toMatchObject({
      firstName: 'Mevcut',
      lastName: 'Hesap',
      phoneVerifiedAt: new Date('2026-08-10T09:00:00.000Z'),
    });

    await request(app.getHttpServer())
      .post(studentsUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        classId: activeClass.id,
        number: 7777,
        firstName: 'Çakışan',
        lastName: 'Numara',
      })
      .expect(409);

    const listResponse = await request(app.getHttpServer())
      .get(`${studentsUrl}?classId=${activeClass.id}&q=Ayşe&page=1&pageSize=1`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(listResponse.body as StudentListResponse).toEqual({
      items: [expect.objectContaining({ id: plainStudent.id, number: 1001 })],
      page: 1,
      pageSize: 1,
      total: 1,
    });

    const updatedResponse = await request(app.getHttpServer())
      .patch(`${studentsUrl}/${plainStudent.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        classId: secondClass.id,
        number: 2001,
        firstName: 'Ayşe',
        lastName: 'Yeni Kaya',
        phone: '+905559999999',
      })
      .expect(200);
    expect(updatedResponse.body).toMatchObject({
      id: plainStudent.id,
      number: 2001,
      lastName: 'Yeni Kaya',
      class: { id: secondClass.id, name: secondClass.name },
      account: { status: 'NOT_PROVISIONED' },
    });

    await request(app.getHttpServer())
      .patch(`${studentsUrl}/${plainStudent.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        classId: archivedClass.id,
        number: 2001,
        firstName: 'Ayşe',
        lastName: 'Yeni Kaya',
      })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`${studentsUrl}/${otherStudent.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        classId: activeClass.id,
        number: 2002,
        firstName: 'Sızmamalı',
        lastName: 'Öğrenci',
      })
      .expect(404);

    const newlyProvisionedPhone = `0532${unique}`;
    const accountResponse = await request(app.getHttpServer())
      .post(`${studentsUrl}/${plainStudent.id}/provision-account`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phone: newlyProvisionedPhone })
      .expect(200);
    expect(accountResponse.body).toMatchObject({
      id: plainStudent.id,
      account: {
        status: 'UNVERIFIED',
        phoneMasked: `+90 532 ••• •• ${unique.slice(-2)}`,
      },
    });
    const linkedUser = await prisma.user.findUniqueOrThrow({
      where: { phone: `+90532${unique}` },
    });
    createdUserIds.push(linkedUser.id);

    await request(app.getHttpServer())
      .post(`${studentsUrl}/${plainStudent.id}/provision-account`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phone: `0533${unique}` })
      .expect(409);

    await request(app.getHttpServer())
      .post(`${studentsUrl}/${provisionedStudent.id}/provision-account`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phone: newlyProvisionedPhone })
      .expect(409);

    const existingStudentMembership =
      await prisma.schoolMembership.findUniqueOrThrow({
        where: {
          schoolId_userId_role: {
            schoolId: school.id,
            userId: existingAccount.id,
            role: MembershipRole.STUDENT,
          },
        },
      });
    const parentMembership = await prisma.schoolMembership.findUniqueOrThrow({
      where: {
        schoolId_userId_role: {
          schoolId: school.id,
          userId: existingAccount.id,
          role: MembershipRole.PARENT,
        },
      },
    });

    const archivedResponse = await request(app.getHttpServer())
      .delete(`${studentsUrl}/${existingStudent.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(archivedResponse.body).toMatchObject({
      id: existingStudent.id,
      deletedAt: expect.any(String),
      account: { status: 'VERIFIED' },
    });
    expect(
      await prisma.schoolMembership.findUniqueOrThrow({
        where: { id: existingStudentMembership.id },
      }),
    ).toMatchObject({ deletedAt: expect.any(Date) });
    expect(
      await prisma.schoolMembership.findUniqueOrThrow({
        where: { id: parentMembership.id },
      }),
    ).toMatchObject({ deletedAt: null });

    const archivedListResponse = await request(app.getHttpServer())
      .get(`${studentsUrl}?status=archived`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((archivedListResponse.body as StudentListResponse).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: existingStudent.id }),
      ]),
    );

    const restoredResponse = await request(app.getHttpServer())
      .post(`${studentsUrl}/${existingStudent.id}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(restoredResponse.body).toMatchObject({
      id: existingStudent.id,
      deletedAt: null,
      account: { status: 'VERIFIED' },
    });
    expect(
      await prisma.schoolMembership.findUniqueOrThrow({
        where: { id: existingStudentMembership.id },
      }),
    ).toMatchObject({ deletedAt: null });

    const restoreBlockedStudent = await prisma.student.create({
      data: {
        schoolId: school.id,
        classId: archivedClass.id,
        number: 9001,
        firstName: 'Arşiv',
        lastName: 'Sınıf',
        deletedAt: new Date(),
      },
    });
    await request(app.getHttpServer())
      .post(`${studentsUrl}/${restoreBlockedStudent.id}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);

    await request(app.getHttpServer())
      .get(`${studentsUrl}?status=unknown`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        schoolId: school.id,
        entityType: 'Student',
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
          action: 'STUDENT_CREATED',
          actorUserId: admin.id,
          actorMembershipId: adminMembership.id,
        }),
        expect.objectContaining({
          action: 'STUDENT_UPDATED',
          actorUserId: admin.id,
          actorMembershipId: adminMembership.id,
        }),
        expect.objectContaining({
          action: 'STUDENT_ACCOUNT_PROVISIONED',
          actorUserId: admin.id,
          actorMembershipId: adminMembership.id,
        }),
        expect.objectContaining({
          action: 'STUDENT_ARCHIVED',
          actorUserId: admin.id,
          actorMembershipId: adminMembership.id,
        }),
        expect.objectContaining({
          action: 'STUDENT_RESTORED',
          actorUserId: admin.id,
          actorMembershipId: adminMembership.id,
        }),
      ]),
    );
    expect(JSON.stringify(auditLogs)).not.toContain(existingAccount.phone);
    expect(JSON.stringify(auditLogs)).not.toContain(provisionedUser.phone);
  });
});
