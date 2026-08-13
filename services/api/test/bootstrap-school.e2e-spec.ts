import {
  BadRequestException,
  ConflictException,
  INestApplicationContext,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomInt } from 'node:crypto';
import { MembershipRole } from '../generated/prisma/client';
import { BootstrapModule } from '../src/bootstrap/bootstrap.module';
import { BootstrapSchoolService } from '../src/bootstrap/bootstrap-school.service';
import { PrismaService } from '../src/database/prisma/prisma.service';

describe('BootstrapSchoolService (e2e)', () => {
  let app: INestApplicationContext;
  let prisma: PrismaService;
  let bootstrapSchool: BootstrapSchoolService;
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(BootstrapModule, {
      logger: false,
    });
    prisma = app.get(PrismaService);
    bootstrapSchool = app.get(BootstrapSchoolService);
  });

  afterAll(async () => {
    if (createdSchoolIds.length > 0) {
      await prisma.auditLog
        .deleteMany({
          where: {
            entityType: 'School',
            entityId: { in: createdSchoolIds },
          },
        })
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

    await app?.close();
  });

  it('creates the school, first ADMIN membership, assignment and audit record atomically', async () => {
    const unique = randomInt(1000000, 9999999).toString();
    const result = await bootstrapSchool.createInitialSchool({
      schoolCode: `BOOT-${unique}`,
      schoolName: 'Bootstrap Okulu',
      adminFirstName: 'İlk',
      adminLastName: 'Yönetici',
      adminPhone: `0555${unique}`,
    });
    createdSchoolIds.push(result.school.id);
    createdUserIds.push(result.adminUser.id);

    const school = await prisma.school.findUnique({
      where: { id: result.school.id },
      include: {
        memberships: true,
        adminAssignments: true,
        auditLogs: true,
      },
    });

    expect(school).not.toBeNull();
    expect(school?.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: result.membershipId,
          userId: result.adminUser.id,
          role: MembershipRole.ADMIN,
          deletedAt: null,
        }),
      ]),
    );
    expect(school?.adminAssignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          membershipId: result.membershipId,
          endedAt: null,
        }),
      ]),
    );
    expect(school?.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'SCHOOL_BOOTSTRAPPED',
          entityType: 'School',
          entityId: result.school.id,
        }),
      ]),
    );
    expect(result.adminUser.phone).toBe(`+90555${unique}`);
  });

  it('reuses an existing user without changing verified identity data', async () => {
    const unique = randomInt(1000000, 9999999).toString();
    const phone = `+90555${unique}`;
    const phoneVerifiedAt = new Date('2026-08-01T09:00:00.000Z');
    const existingUser = await prisma.user.create({
      data: {
        phone,
        firstName: 'Mevcut',
        lastName: 'Kullanıcı',
        phoneVerifiedAt,
      },
    });
    createdUserIds.push(existingUser.id);

    const result = await bootstrapSchool.createInitialSchool({
      schoolCode: `REUSE-${unique}`,
      schoolName: 'İkinci Okul',
      adminFirstName: 'Farklı',
      adminLastName: 'İsim',
      adminPhone: phone,
    });
    createdSchoolIds.push(result.school.id);

    const reusedUser = await prisma.user.findUniqueOrThrow({
      where: { id: existingUser.id },
    });

    expect(result.adminUser.id).toBe(existingUser.id);
    expect(reusedUser).toMatchObject({
      firstName: 'Mevcut',
      lastName: 'Kullanıcı',
      phoneVerifiedAt,
    });
  });

  it('rejects an already used school code without creating a second school', async () => {
    const unique = randomInt(1000000, 9999999).toString();
    const input = {
      schoolCode: `ONCE-${unique}`,
      schoolName: 'Bir Kez Okulu',
      adminFirstName: 'İlk',
      adminLastName: 'Admin',
      adminPhone: `0555${unique}`,
    };
    const first = await bootstrapSchool.createInitialSchool(input);
    createdSchoolIds.push(first.school.id);
    createdUserIds.push(first.adminUser.id);

    await expect(
      bootstrapSchool.createInitialSchool({
        ...input,
        adminPhone: `0556${unique}`,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(
      await prisma.school.count({ where: { code: input.schoolCode } }),
    ).toBe(1);
    expect(
      await prisma.user.count({ where: { phone: `+90556${unique}` } }),
    ).toBe(0);
  });

  it('rejects an invalid admin phone before writing any data', async () => {
    const unique = randomInt(1000000, 9999999).toString();
    const schoolCode = `INVALID-${unique}`;

    await expect(
      bootstrapSchool.createInitialSchool({
        schoolCode,
        schoolName: 'Geçersiz Telefon Okulu',
        adminFirstName: 'İlk',
        adminLastName: 'Admin',
        adminPhone: 'telefon-değil',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(await prisma.school.count({ where: { code: schoolCode } })).toBe(0);
  });
});
