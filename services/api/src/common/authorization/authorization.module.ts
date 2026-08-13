import { Global, Module } from '@nestjs/common';
import { SchoolMembershipGuard } from './guards/school-membership.guard';

@Global()
@Module({
  providers: [SchoolMembershipGuard],
  exports: [SchoolMembershipGuard],
})
export class AuthorizationModule {}
