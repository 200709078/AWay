import type { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user: {
        id: string;
        phone: string;
        firstName: string;
        lastName: string;
      };
    }
  }
}

export {};
