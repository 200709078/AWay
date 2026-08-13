import type { AuthenticatedRequest } from "../auth/auth-context";

export type MembershipRole = "ADMIN" | "TEACHER" | "PARENT" | "STUDENT";

export interface SchoolSummary {
  id: string;
  code: string;
  name: string;
  roles: MembershipRole[];
}

export interface SchoolContext {
  school: Omit<SchoolSummary, "roles">;
  roles: MembershipRole[];
}

export function getMySchools(
  request: AuthenticatedRequest,
): Promise<SchoolSummary[]> {
  return request<SchoolSummary[]>("/users/me/schools");
}

export function getSchoolContext(
  request: AuthenticatedRequest,
  schoolId: string,
): Promise<SchoolContext> {
  return request<SchoolContext>(`/schools/${schoolId}/context`);
}
