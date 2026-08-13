import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/guards/jwt/jwt.guard';
import { CurrentSchoolAccess } from '../common/authorization/decorators/current-school-access.decorator';
import { SchoolRoles } from '../common/authorization/decorators/school-roles.decorator';
import { SchoolMembershipGuard } from '../common/authorization/guards/school-membership.guard';
import type { SchoolAccess } from '../common/authorization/types/school-access.type';

@Controller('schools')
export class SchoolsController {
  @Get(':schoolId/context')
  @UseGuards(JwtGuard, SchoolMembershipGuard)
  @SchoolRoles()
  context(@CurrentSchoolAccess() access: SchoolAccess) {
    return {
      school: access.school,
      roles: access.memberships.map((membership) => membership.role),
    };
  }
}
