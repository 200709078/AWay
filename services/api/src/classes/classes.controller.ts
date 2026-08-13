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
import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

@Controller('schools/:schoolId/classes')
@UseGuards(JwtGuard, SchoolMembershipGuard)
@SchoolRoles(MembershipRole.ADMIN)
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Get()
  findAll(
    @Query('status') status: string | undefined,
    @CurrentSchoolAccess() access: SchoolAccess,
  ) {
    return this.classesService.findAll(access.school.id, status);
  }

  @Post()
  create(
    @Body() dto: CreateClassDto,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.classesService.create(
      access.school.id,
      dto,
      this.actor(access, user),
    );
  }

  @Patch(':classId')
  update(
    @Param('classId') classId: string,
    @Body() dto: UpdateClassDto,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.classesService.update(
      access.school.id,
      classId,
      dto,
      this.actor(access, user),
    );
  }

  @Delete(':classId')
  archive(
    @Param('classId') classId: string,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.classesService.archive(
      access.school.id,
      classId,
      this.actor(access, user),
    );
  }

  @Post(':classId/restore')
  @HttpCode(HttpStatus.OK)
  restore(
    @Param('classId') classId: string,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.classesService.restore(
      access.school.id,
      classId,
      this.actor(access, user),
    );
  }

  private actor(access: SchoolAccess, user: CurrentUserType) {
    const adminMembership = access.memberships.find(
      (membership) => membership.role === MembershipRole.ADMIN,
    );

    if (!adminMembership) {
      // SchoolMembershipGuard aynı rolü zorunlu tuttuğu için bu noktaya gelinmez.
      throw new ForbiddenException('Aktif ADMIN üyeliği bulunamadı.');
    }

    return {
      userId: user.id,
      membershipId: adminMembership.id,
    };
  }
}
