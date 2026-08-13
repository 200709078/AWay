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
import { CreateStudentDto } from './dto/create-student.dto';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';
import { ProvisionStudentAccountDto } from './dto/provision-student-account.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentsService } from './students.service';

@Controller('schools/:schoolId/students')
@UseGuards(JwtGuard, SchoolMembershipGuard)
@SchoolRoles(MembershipRole.ADMIN)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  findAll(
    @Query() query: ListStudentsQueryDto,
    @CurrentSchoolAccess() access: SchoolAccess,
  ) {
    return this.studentsService.findAll(access.school.id, query);
  }

  @Post()
  create(
    @Body() dto: CreateStudentDto,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.studentsService.create(
      access.school.id,
      dto,
      this.actor(access, user),
    );
  }

  @Patch(':studentId')
  update(
    @Param('studentId') studentId: string,
    @Body() dto: UpdateStudentDto,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.studentsService.update(
      access.school.id,
      studentId,
      dto,
      this.actor(access, user),
    );
  }

  @Post(':studentId/provision-account')
  @HttpCode(HttpStatus.OK)
  provisionAccount(
    @Param('studentId') studentId: string,
    @Body() dto: ProvisionStudentAccountDto,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.studentsService.provisionAccount(
      access.school.id,
      studentId,
      dto,
      this.actor(access, user),
    );
  }

  @Delete(':studentId')
  archive(
    @Param('studentId') studentId: string,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.studentsService.archive(
      access.school.id,
      studentId,
      this.actor(access, user),
    );
  }

  @Post(':studentId/restore')
  @HttpCode(HttpStatus.OK)
  restore(
    @Param('studentId') studentId: string,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.studentsService.restore(
      access.school.id,
      studentId,
      this.actor(access, user),
    );
  }

  private actor(access: SchoolAccess, user: CurrentUserType) {
    const adminMembership = access.memberships.find(
      (membership) => membership.role === MembershipRole.ADMIN,
    );

    if (!adminMembership) {
      throw new ForbiddenException('Aktif ADMIN üyeliği bulunamadı.');
    }

    return {
      userId: user.id,
      membershipId: adminMembership.id,
    };
  }
}
