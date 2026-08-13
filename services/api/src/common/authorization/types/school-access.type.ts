import type { MembershipRole } from '../../../../generated/prisma/client';

export interface SchoolAccessMembership {
  id: string;
  role: MembershipRole;
}

export interface SchoolAccess {
  school: {
    id: string;
    code: string;
    name: string;
  };
  memberships: SchoolAccessMembership[];
}
