import { SetMetadata } from '@nestjs/common';
import type { MembershipRole } from '../../../../generated/prisma/client';

export const SCHOOL_ROLES_KEY = 'away:school-roles';

export const SchoolRoles = (...roles: MembershipRole[]) =>
  SetMetadata(SCHOOL_ROLES_KEY, roles);
