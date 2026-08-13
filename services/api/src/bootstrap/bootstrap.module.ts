import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma/prisma.module';
import { BootstrapSchoolService } from './bootstrap-school.service';

@Module({
  imports: [PrismaModule],
  providers: [BootstrapSchoolService],
})
export class BootstrapModule {}
