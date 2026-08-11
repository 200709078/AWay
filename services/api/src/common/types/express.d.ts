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
