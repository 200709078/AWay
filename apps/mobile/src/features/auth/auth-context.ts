import { createContext, useContext } from "react";
import type {
  AuthenticatedRequest,
  AuthenticatedSession,
  MembershipRole,
  SchoolContext,
} from "@/lib/types";

export interface SelectedSchool {
  school: SchoolContext["school"];
  roles: MembershipRole[];
  selectedRole: MembershipRole;
}

export interface AuthContextValue {
  session: AuthenticatedSession | null;
  isRestoring: boolean;
  restoreError: string | null;
  pendingPhone: string | null;
  selectedSchool: SelectedSchool | null;
  requestOtp: (phone: string) => Promise<void>;
  verifyOtp: (code: string) => Promise<void>;
  cancelOtp: () => void;
  request: AuthenticatedRequest;
  selectSchool: (
    context: SchoolContext,
    selectedRole: MembershipRole,
  ) => void;
  clearSelectedSchool: () => void;
  retryRestore: () => Promise<void>;
  discardStoredSession: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth, AuthProvider altında kullanılmalıdır.");
  }

  return context;
}
