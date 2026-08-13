import {
  Body,
  Controller,
  Delete,
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
import { CreateLessonPeriodDto } from './dto/create-lesson-period.dto';
import { ListLessonPeriodsQueryDto } from './dto/list-lesson-periods-query.dto';
import { UpdateLessonPeriodDto } from './dto/update-lesson-period.dto';
import { LessonPeriodsService } from './lesson-periods.service';

@Controller('schools/:schoolId/lesson-periods')
@UseGuards(JwtGuard, SchoolMembershipGuard)
@SchoolRoles(MembershipRole.ADMIN)
export class LessonPeriodsController {
  constructor(private readonly lessonPeriodsService: LessonPeriodsService) {}

  @Get()
  findAll(
    @Query() query: ListLessonPeriodsQueryDto,
    @CurrentSchoolAccess() access: SchoolAccess,
  ) {
    return this.lessonPeriodsService.findAll(access.school.id, query.dayOfWeek);
  }

  @Post()
  create(
    @Body() dto: CreateLessonPeriodDto,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.lessonPeriodsService.create(
      access.school.id,
      dto,
      this.actor(access, user),
    );
  }

  @Patch(':lessonPeriodId')
  update(
    @Param('lessonPeriodId') lessonPeriodId: string,
    @Body() dto: UpdateLessonPeriodDto,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.lessonPeriodsService.update(
      access.school.id,
      lessonPeriodId,
      dto,
      this.actor(access, user),
    );
  }

  @Delete(':lessonPeriodId')
  remove(
    @Param('lessonPeriodId') lessonPeriodId: string,
    @CurrentSchoolAccess() access: SchoolAccess,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.lessonPeriodsService.remove(
      access.school.id,
      lessonPeriodId,
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
