import type { CurrentUser } from '../decorators/current-user.decorator';
import type { SchoolAccess } from '../authorization/types/school-access.type';

declare global {
  namespace Express {
    interface Request {
      user: CurrentUser;
      schoolAccess: SchoolAccess;
    }
  }
}

export {};
