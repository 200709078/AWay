import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { MembershipRole } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';

interface SchoolSummaryResponse {
  id: string;
  code: string;
  name: string;
  roles: MembershipRole[];
}

interface SchoolContextResponse {
  school: Omit<SchoolSummaryResponse, 'roles'>;
  roles: MembershipRole[];
}

describe('School access (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let createdUserId: string | null = null;
  const createdSchoolIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    await app.init();
  });

  afterAll(async () => {
    if (createdSchoolIds.length > 0) {
      await prisma.school
        .deleteMany({ where: { id: { in: createdSchoolIds } } })
        .catch(() => undefined);
    }

    if (createdUserId) {
      await prisma.user
        .delete({ where: { id: createdUserId } })
        .catch(() => undefined);
    }

    await app.close();
  });

  it('returns only the caller’s active schools and enforces the school route context', async () => {
    const unique = randomInt(1000000, 9999999).toString();
    const user = await prisma.user.create({
      data: {
        phone: `+90555${unique}`,
        firstName: 'School',
        lastName: 'Access',
      },
    });
    createdUserId = user.id;

    const allowedSchool = await prisma.school.create({
      data: {
        code: `ACCESS-${unique}`,
        name: 'Erişim Okulu',
      },
    });
    const otherSchool = await prisma.school.create({
      data: {
        code: `OTHER-${unique}`,
        name: 'Diğer Okul',
      },
    });
    createdSchoolIds.push(allowedSchool.id, otherSchool.id);

    await prisma.schoolMembership.createMany({
      data: [
        {
          schoolId: allowedSchool.id,
          userId: user.id,
          role: MembershipRole.TEACHER,
        },
        {
          schoolId: allowedSchool.id,
          userId: user.id,
          role: MembershipRole.PARENT,
        },
      ],
    });

    const accessToken = await jwtService.signAsync({
      sub: user.id,
      phone: user.phone,
    });

    const schoolsResponse = await request(app.getHttpServer())
      .get('/users/me/schools')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const schools = schoolsResponse.body as unknown as SchoolSummaryResponse[];

    expect(schools).toHaveLength(1);
    expect(schools[0]).toMatchObject({
      id: allowedSchool.id,
      code: allowedSchool.code,
      name: allowedSchool.name,
    });
    expect(schools[0].roles).toEqual(
      expect.arrayContaining([MembershipRole.TEACHER, MembershipRole.PARENT]),
    );

    const contextResponse = await request(app.getHttpServer())
      .get(`/schools/${allowedSchool.id}/context`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const context = contextResponse.body as unknown as SchoolContextResponse;

    expect(context.school).toEqual({
      id: allowedSchool.id,
      code: allowedSchool.code,
      name: allowedSchool.name,
    });
    expect(context.roles).toEqual(
      expect.arrayContaining([MembershipRole.TEACHER, MembershipRole.PARENT]),
    );

    await request(app.getHttpServer())
      .get(`/schools/${otherSchool.id}/context`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('requires a JWT for school-scoped access', async () => {
    await request(app.getHttpServer())
      .get('/schools/not-authorized/context')
      .expect(401);
  });
});
