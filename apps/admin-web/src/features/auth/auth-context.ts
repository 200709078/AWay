import { createContext, useContext } from "react";
import type { AuthenticatedSession, SignedInUser } from "./auth-api";

export type AuthenticatedRequest = <T>(
  path: string,
  options?: RequestInit,
) => Promise<T>;

export interface AuthContextValue {
  accessToken: string | null;
  user: SignedInUser | null;
  isRestoring: boolean;
  request: AuthenticatedRequest;
  startSession: (session: AuthenticatedSession) => void;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth, AuthProvider içinde kullanılmalıdır.");
  }

  return context;
}
