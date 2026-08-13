export type MembershipRole = "ADMIN" | "TEACHER" | "PARENT" | "STUDENT";

export interface AuthUser {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
}

export interface AuthenticatedSession {
  accessToken: string;
  user: AuthUser;
}

export interface MobileAuthSession extends AuthenticatedSession {
  refreshToken: string;
}

export interface SchoolSummary {
  id: string;
  code: string;
  name: string;
  roles: MembershipRole[];
}

export interface SchoolContext {
  school: Pick<SchoolSummary, "id" | "code" | "name">;
  roles: MembershipRole[];
}

export type AuthenticatedRequest = <T>(
  path: string,
  options?: RequestInit,
) => Promise<T>;

export function isAttendanceRole(role: MembershipRole): boolean {
  return role === "ADMIN" || role === "TEACHER";
}
