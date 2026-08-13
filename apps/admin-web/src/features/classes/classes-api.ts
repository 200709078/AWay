import type { AuthenticatedRequest } from "../auth/auth-context";

export type ClassStatus = "active" | "archived";

export interface ClassSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  studentCount: number;
}

export function getClasses(
  request: AuthenticatedRequest,
  schoolId: string,
  status: ClassStatus,
): Promise<ClassSummary[]> {
  return request<ClassSummary[]>(
    `/schools/${schoolId}/classes?status=${status}`,
  );
}

export function createClass(
  request: AuthenticatedRequest,
  schoolId: string,
  name: string,
): Promise<ClassSummary> {
  return request<ClassSummary>(`/schools/${schoolId}/classes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function updateClass(
  request: AuthenticatedRequest,
  schoolId: string,
  classId: string,
  name: string,
): Promise<ClassSummary> {
  return request<ClassSummary>(`/schools/${schoolId}/classes/${classId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function archiveClass(
  request: AuthenticatedRequest,
  schoolId: string,
  classId: string,
): Promise<ClassSummary> {
  return request<ClassSummary>(`/schools/${schoolId}/classes/${classId}`, {
    method: "DELETE",
  });
}

export function restoreClass(
  request: AuthenticatedRequest,
  schoolId: string,
  classId: string,
): Promise<ClassSummary> {
  return request<ClassSummary>(
    `/schools/${schoolId}/classes/${classId}/restore`,
    { method: "POST" },
  );
}
