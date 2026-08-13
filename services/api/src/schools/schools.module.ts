import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SchoolsController } from './schools.controller';

@Module({
  imports: [AuthModule],
  controllers: [SchoolsController],
})
export class SchoolsModule {}
