import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SchoolsModule } from './schools/schools.module';
import { MembershipsModule } from './memberships/memberships.module';
import { SchoolAdminAssignmentsModule } from './school-admin-assignments/school-admin-assignments.module';
import { ClassesModule } from './classes/classes.module';
import { StudentsModule } from './students/students.module';
import { ParentsModule } from './parents/parents.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LessonPeriodsModule } from './lesson-periods/lesson-periods.module';
import { AuditModule } from './audit/audit.module';
import { PrismaModule } from './database/prisma/prisma.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    SchoolsModule,
    MembershipsModule,
    SchoolAdminAssignmentsModule,
    ClassesModule,
    StudentsModule,
    ParentsModule,
    AttendanceModule,
    LessonPeriodsModule,
    AuditModule,
    HealthModule,
  ],
})
export class AppModule {}
