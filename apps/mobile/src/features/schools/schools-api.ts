import type {
  AuthenticatedRequest,
  SchoolContext,
  SchoolSummary,
} from "@/lib/types";

export function getMySchools(
  request: AuthenticatedRequest,
): Promise<SchoolSummary[]> {
  return request<SchoolSummary[]>("/users/me/schools");
}

export function getSchoolContext(
  request: AuthenticatedRequest,
  schoolId: string,
): Promise<SchoolContext> {
  return request<SchoolContext>(`/schools/${encodeURIComponent(schoolId)}/context`);
}
