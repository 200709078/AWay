import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash, randomInt } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { MembershipRole } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    phone: string;
  };
}

describe('Auth flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDevOtpCode = process.env.DEV_OTP_CODE;

  beforeAll(async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEV_OTP_CODE = '111111';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    if (createdSchoolIds.length > 0) {
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

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalDevOtpCode === undefined) {
      delete process.env.DEV_OTP_CODE;
    } else {
      process.env.DEV_OTP_CODE = originalDevOtpCode;
    }
  });

  it('uses the configured fixed OTP for the development app', async () => {
    const user = await createEligibleUser();

    await request(app.getHttpServer())
      .post('/auth/request-otp')
      .send({ phone: user.phone })
      .expect(201);

    const otp = await prisma.otpCode.findFirstOrThrow({
      where: {
        userId: user.id,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(otp.codeHash).toBe(hash('111111'));

    await request(app.getHttpServer())
      .post('/auth/verify-otp')
      .send({ phone: user.phone, code: '111111' })
      .expect(201);
  });

  it('only issues OTPs to active memberships and invalidates a previous code', async () => {
    const ineligiblePhone = `+90555${randomInt(1000000, 9999999)}`;
    const ineligibleUser = await prisma.user.create({
      data: {
        phone: ineligiblePhone,
        firstName: 'Üyeliksiz',
        lastName: 'Kullanıcı',
      },
    });
    createdUserIds.push(ineligibleUser.id);

    const ineligibleResponse = await request(app.getHttpServer())
      .post('/auth/request-otp')
      .send({ phone: ineligiblePhone })
      .expect(201);

    expect(ineligibleResponse.body).toEqual({
      message: 'Telefon numarası uygunsa OTP gönderildi.',
      phone: ineligiblePhone,
    });
    expect(
      await prisma.otpCode.count({ where: { userId: ineligibleUser.id } }),
    ).toBe(0);

    const eligibleUser = await createEligibleUser();
    await createOtp(eligibleUser.id, '111111');

    await request(app.getHttpServer())
      .post('/auth/request-otp')
      .send({ phone: eligibleUser.phone })
      .expect(201);

    const oldOtp = await prisma.otpCode.findFirstOrThrow({
      where: {
        userId: eligibleUser.id,
        codeHash: hash('111111'),
      },
    });

    expect(oldOtp.consumedAt).not.toBeNull();

    const concurrentUser = await createEligibleUser();
    const concurrentResponses = await Promise.all([
      request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ phone: concurrentUser.phone }),
      request(app.getHttpServer())
        .post('/auth/request-otp')
        .send({ phone: concurrentUser.phone }),
    ]);

    expect(concurrentResponses.map((response) => response.status)).toEqual([
      201, 201,
    ]);
    expect(
      await prisma.otpCode.count({
        where: { userId: concurrentUser.id, consumedAt: null },
      }),
    ).toBe(1);
  });

  it('consumes an OTP only once, marks the phone verified and rotates mobile refresh tokens', async () => {
    const user = await createEligibleUser();
    await createOtp(user.id, '222222');

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ phone: user.phone, code: '222222' }),
      request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ phone: user.phone, code: '222222' }),
    ]);

    const successfulResponse = [first, second].find(
      (response) => response.status === 201,
    );
    const unsuccessfulResponse = [first, second].find(
      (response) => response.status === 401,
    );

    expect(successfulResponse).toBeDefined();
    expect(unsuccessfulResponse).toBeDefined();

    const verifiedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(verifiedUser.phoneVerifiedAt).not.toBeNull();

    const auth = successfulResponse?.body as AuthResponse;
    expect(auth.refreshToken).toEqual(expect.any(String));
    expect(
      await prisma.refreshSession.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(1);

    const refreshedResponse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: auth.refreshToken })
      .expect(201);
    const refreshed = refreshedResponse.body as AuthResponse;

    expect(refreshed.refreshToken).not.toBe(auth.refreshToken);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: auth.refreshToken })
      .expect(401);
    expect(
      await prisma.refreshSession.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(0);
  });

  it('keeps the web refresh token in an HttpOnly cookie only', async () => {
    const user = await createEligibleUser();
    await createOtp(user.id, '333333');

    const verifyResponse = await request(app.getHttpServer())
      .post('/auth/web/verify-otp')
      .send({ phone: user.phone, code: '333333' })
      .expect(201);

    const verifyBody = verifyResponse.body as Record<string, unknown>;
    expect(verifyBody.message).toBe('OTP doğrulandı.');
    expect(typeof verifyBody.accessToken).toBe('string');
    expect(verifyBody).not.toHaveProperty('refreshToken');

    const verifyCookie = extractCookie(verifyResponse.headers['set-cookie']);
    expect(verifyCookie).toContain('away_web_refresh=');
    expect(verifyCookie).toContain('HttpOnly');
    expect(verifyCookie).toContain('Path=/auth/web');
    expect(verifyCookie).toContain('SameSite=Lax');

    const refreshResponse = await request(app.getHttpServer())
      .post('/auth/web/refresh')
      .set('Cookie', verifyCookie)
      .expect(201);

    expect(refreshResponse.body).toHaveProperty('accessToken');
    expect(refreshResponse.body).not.toHaveProperty('refreshToken');

    const refreshedCookie = extractCookie(
      refreshResponse.headers['set-cookie'],
    );
    await request(app.getHttpServer())
      .post('/auth/web/logout')
      .set('Cookie', refreshedCookie)
      .expect(201);
  });

  async function createEligibleUser() {
    const unique = randomInt(1000000, 9999999).toString();
    const user = await prisma.user.create({
      data: {
        phone: `+90555${unique}`,
        firstName: 'Auth',
        lastName: 'Test',
      },
    });
    const school = await prisma.school.create({
      data: {
        code: `AUTH-${unique}`,
        name: 'Auth Test Okulu',
      },
    });
    await prisma.schoolMembership.create({
      data: {
        schoolId: school.id,
        userId: user.id,
        role: MembershipRole.TEACHER,
      },
    });

    createdUserIds.push(user.id);
    createdSchoolIds.push(school.id);

    return user;
  }

  async function createOtp(userId: string, code: string) {
    return prisma.otpCode.create({
      data: {
        userId,
        codeHash: hash(code),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
  }
});

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function extractCookie(header: string[] | undefined): string {
  const cookie = header?.[0];

  if (!cookie) {
    throw new Error('Refresh cookie bulunamadı.');
  }

  return cookie;
}
