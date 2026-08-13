import {
  Body,
  Controller,
  ForbiddenException,
  Get,
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
import { AttendanceService } from './attendance.service';
import { CreateAttendanceEditRequestDto } from './dto/create-attendance-edit-request.dto';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { GetAttendanceEntryContextQueryDto } from './dto/get-attendance-entry-context-query.dto';
import { ListAttendanceBoardQueryDto } from './dto/list-attendance-board-query.dto';
import { ReviewAttendanceEditRequestDto } from './dto/review-attendance-edit-request.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

@Controller('schools/:schoolId/attendances')
@UseGuards(JwtGuard, SchoolMembershipGuard)
@SchoolRoles(MembershipRole.ADMIN, MembershipRole.TEACHER)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('board')
  findBoard(
    @Query() query: ListAttendanceBoardQueryDto,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.attendanceService.findBoard(
      access.school.id,
      query,
      this.actor(access, user),
    );
  }

  @Get('entry-context')
  getEntryContext(
    @Query() query: GetAttendanceEntryContextQueryDto,
    @CurrentSchoolAccess() access: SchoolAccess,
  ) {
    return this.attendanceService.getEntryContext(access.school.id, query);
  }

  @Post()
  create(
    @Body() dto: CreateAttendanceDto,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.attendanceService.create(
      access.school.id,
      dto,
      this.actor(access, user),
    );
  }

  @Get(':attendanceId')
  findDetail(
    @Param('attendanceId') attendanceId: string,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.attendanceService.findDetail(
      access.school.id,
      attendanceId,
      this.actor(access, user),
    );
  }

  @Patch(':attendanceId')
  update(
    @Param('attendanceId') attendanceId: string,
    @Body() dto: UpdateAttendanceDto,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.attendanceService.update(
      access.school.id,
      attendanceId,
      dto,
      this.actor(access, user),
    );
  }

  @Post(':attendanceId/review-lock')
  @SchoolRoles(MembershipRole.ADMIN)
  reviewLock(
    @Param('attendanceId') attendanceId: string,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.attendanceService.reviewLock(
      access.school.id,
      attendanceId,
      this.actor(access, user),
    );
  }

  @Post(':attendanceId/edit-requests')
  createEditRequest(
    @Param('attendanceId') attendanceId: string,
    @Body() dto: CreateAttendanceEditRequestDto,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.attendanceService.createEditRequest(
      access.school.id,
      attendanceId,
      dto,
      this.actor(access, user),
    );
  }

  @Get(':attendanceId/edit-requests')
  @SchoolRoles(MembershipRole.ADMIN)
  listEditRequests(
    @Param('attendanceId') attendanceId: string,
    @CurrentSchoolAccess() access: SchoolAccess,
  ) {
    return this.attendanceService.listEditRequests(
      access.school.id,
      attendanceId,
    );
  }

  @Post(':attendanceId/edit-requests/:requestId/approve')
  @SchoolRoles(MembershipRole.ADMIN)
  approveEditRequest(
    @Param('attendanceId') attendanceId: string,
    @Param('requestId') requestId: string,
    @Body() dto: ReviewAttendanceEditRequestDto,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.attendanceService.approveEditRequest(
      access.school.id,
      attendanceId,
      requestId,
      dto,
      this.actor(access, user),
    );
  }

  @Post(':attendanceId/edit-requests/:requestId/reject')
  @SchoolRoles(MembershipRole.ADMIN)
  rejectEditRequest(
    @Param('attendanceId') attendanceId: string,
    @Param('requestId') requestId: string,
    @Body() dto: ReviewAttendanceEditRequestDto,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.attendanceService.rejectEditRequest(
      access.school.id,
      attendanceId,
      requestId,
      dto,
      this.actor(access, user),
    );
  }

  private actor(access: SchoolAccess, user: CurrentUserType) {
    const adminMembership = access.memberships.find(
      (membership) => membership.role === MembershipRole.ADMIN,
    );
    const teacherMembership = access.memberships.find(
      (membership) => membership.role === MembershipRole.TEACHER,
    );
    const auditMembership = adminMembership ?? teacherMembership;

    if (!auditMembership) {
      throw new ForbiddenException('Aktif personel üyeliği bulunamadı.');
    }

    return {
      userId: user.id,
      membershipIds: access.memberships
        .filter(
          (membership) =>
            membership.role === MembershipRole.ADMIN ||
            membership.role === MembershipRole.TEACHER,
        )
        .map((membership) => membership.id),
      auditMembershipId: auditMembership.id,
      isAdmin: Boolean(adminMembership),
    };
  }
}
