import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '../../generated/prisma/client';
import { JwtGuard } from '../auth/guards/jwt/jwt.guard';
import { CurrentSchoolAccess } from '../common/authorization/decorators/current-school-access.decorator';
import { SchoolRoles } from '../common/authorization/decorators/school-roles.decorator';
import { SchoolMembershipGuard } from '../common/authorization/guards/school-membership.guard';
import type { SchoolAccess } from '../common/authorization/types/school-access.type';
import {
  CurrentUser,
  type CurrentUser as CurrentUserType,
} from '../common/decorators/current-user.decorator';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { ListTeachersQueryDto } from './dto/list-teachers-query.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { MembershipsService } from './memberships.service';

@Controller('schools/:schoolId/teachers')
@UseGuards(JwtGuard, SchoolMembershipGuard)
@SchoolRoles(MembershipRole.ADMIN)
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get()
  findAll(
    @Query() query: ListTeachersQueryDto,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.membershipsService.findTeachers(
      access.school.id,
      query,
      user.id,
    );
  }

  @Post()
  createTeacher(
    @Body() dto: CreateTeacherDto,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.membershipsService.createTeacher(
      access.school.id,
      dto,
      this.actor(access, user),
    );
  }

  @Patch(':teacherId')
  updateTeacher(
    @Param('teacherId') teacherId: string,
    @Body() dto: UpdateTeacherDto,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.membershipsService.updateTeacher(
      access.school.id,
      teacherId,
      dto,
      this.actor(access, user),
    );
  }

  @Delete(':teacherId')
  archiveTeacher(
    @Param('teacherId') teacherId: string,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.membershipsService.archiveTeacher(
      access.school.id,
      teacherId,
      this.actor(access, user),
    );
  }

  @Post(':teacherId/restore')
  @HttpCode(HttpStatus.OK)
  restoreTeacher(
    @Param('teacherId') teacherId: string,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.membershipsService.restoreTeacher(
      access.school.id,
      teacherId,
      this.actor(access, user),
    );
  }

  private actor(access: SchoolAccess, user: CurrentUserType) {
    const adminMembership = access.memberships.find(
      (membership) => membership.role === MembershipRole.ADMIN,
    );

    if (!adminMembership) {
      // SchoolMembershipGuard aynı rolü zorunlu tuttuğu için bu noktaya gelilmez.
      throw new ForbiddenException('Aktif ADMIN üyeliği bulunamadı.');
    }

    return {
      userId: user.id,
      membershipId: adminMembership.id,
    };
  }
}
