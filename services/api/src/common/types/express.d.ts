import type { CurrentUser } from '../decorators/current-user.decorator';

declare global {
  namespace Express {
    interface Request {
      user: CurrentUser;
    }
  }
}

export {};
