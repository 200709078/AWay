import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { MembershipRole } from '../../../../generated/prisma/client';
import type { PrismaService } from '../../../database/prisma/prisma.service';
import { SchoolMembershipGuard } from './school-membership.guard';

describe('SchoolMembershipGuard', () => {
  const school = {
    id: 'school-1',
    code: 'SCHOOL-1',
    name: 'Test Okulu',
  };

  function createContext(request: unknown): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
  }

  function createGuard(requiredRoles: MembershipRole[] = []) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
    } as unknown as Reflector;

    const findFirst = jest.fn();
    const prisma = {
      school: { findFirst },
    } as unknown as PrismaService;

    return {
      guard: new SchoolMembershipGuard(reflector, prisma),
      findFirst,
    };
  }

  it('attaches the active school memberships when the user has a required role', async () => {
    const { guard, findFirst } = createGuard([MembershipRole.ADMIN]);
    const request = {
      params: { schoolId: school.id },
      user: { id: 'user-1' },
    };

    findFirst.mockResolvedValue({
      ...school,
      memberships: [
        { id: 'membership-admin', role: MembershipRole.ADMIN },
        { id: 'membership-teacher', role: MembershipRole.TEACHER },
      ],
    });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(request.schoolAccess).toEqual({
      school,
      memberships: [
        { id: 'membership-admin', role: MembershipRole.ADMIN },
        { id: 'membership-teacher', role: MembershipRole.TEACHER },
      ],
    });
  });

  it('rejects an active member who lacks the required role', async () => {
    const { guard, findFirst } = createGuard([MembershipRole.ADMIN]);
    const request = {
      params: { schoolId: school.id },
      user: { id: 'user-1' },
    };

    findFirst.mockResolvedValue({
      ...school,
      memberships: [{ id: 'membership-teacher', role: MembershipRole.TEACHER }],
    });

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a request without an authenticated user before querying memberships', async () => {
    const { guard, findFirst } = createGuard();
    const request = { params: { schoolId: school.id } };

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('requires the school route parameter', async () => {
    const { guard } = createGuard();
    const request = { params: {}, user: { id: 'user-1' } };

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
