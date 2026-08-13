import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { SchoolAccess } from '../types/school-access.type';

export const CurrentSchoolAccess = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SchoolAccess => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.schoolAccess;
  },
);
