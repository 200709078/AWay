import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomInt } from 'node:crypto';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma/prisma.service';

describe('UsersController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let createdUserId: string | null = null;

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
    if (createdUserId) {
      await prisma.user
        .delete({
          where: { id: createdUserId },
        })
        .catch(() => undefined);
    }

    await app.close();
  });

  it('GET /users/me returns current user for a valid JWT (200)', async () => {
    const user = await prisma.user.create({
      data: {
        phone: `+90555${randomInt(1000000, 9999999)}`,
        firstName: 'Test',
        lastName: 'User',
      },
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    createdUserId = user.id;

    const accessToken = await jwtService.signAsync({
      sub: user.id,
      phone: user.phone,
    });

    const response = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = response.body as Record<string, unknown>;

    expect(body).toEqual({
      id: user.id,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    });

    expect(Object.keys(body).sort()).toEqual(
      ['createdAt', 'firstName', 'id', 'lastName', 'phone', 'updatedAt'].sort(),
    );
    expect(body).not.toHaveProperty('otpCodes');
    expect(body).not.toHaveProperty('refreshSessions');
  });

  it('GET /users/me returns 401 without a JWT', async () => {
    await request(app.getHttpServer()).get('/users/me').expect(401);
  });

  it('GET /users/me returns 401 for a valid JWT with unknown user id', async () => {
    const accessToken = await jwtService.signAsync({
      sub: 'non-existent-user-id',
      phone: '+905550000000',
    });

    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });
});
