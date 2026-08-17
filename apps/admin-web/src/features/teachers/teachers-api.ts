import type { AuthenticatedRequest } from "../auth/auth-context";

export type TeacherStatus = "active" | "archived";

export interface TeacherSummary {
  id: string;
  firstName: string;
  lastName: string;
  isCurrentUser: boolean;
  address: string | null;
  account: {
    status: "UNVERIFIED" | "VERIFIED";
    phone: string;
  };
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TeacherList {
  items: TeacherSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CreateTeacherInput {
  firstName: string;
  lastName: string;
  phone: string;
  address?: string;
}

export interface UpdateTeacherInput {
  address?: string;
}

export function getTeachers(
  request: AuthenticatedRequest,
  schoolId: string,
  input: {
    status: TeacherStatus;
    search?: string;
    page: number;
    pageSize: number;
  },
): Promise<TeacherList> {
  const query = new URLSearchParams({
    status: input.status,
    page: String(input.page),
    pageSize: String(input.pageSize),
  });

  if (input.search) {
    query.set("q", input.search);
  }

  return request<TeacherList>(
    `/schools/${schoolId}/teachers?${query.toString()}`,
  );
}

export function createTeacher(
  request: AuthenticatedRequest,
  schoolId: string,
  input: CreateTeacherInput,
): Promise<TeacherSummary> {
  return request<TeacherSummary>(`/schools/${schoolId}/teachers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateTeacher(
  request: AuthenticatedRequest,
  schoolId: string,
  teacherId: string,
  input: UpdateTeacherInput,
): Promise<TeacherSummary> {
  return request<TeacherSummary>(`/schools/${schoolId}/teachers/${teacherId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function archiveTeacher(
  request: AuthenticatedRequest,
  schoolId: string,
  teacherMembershipId: string,
): Promise<TeacherSummary> {
  return request<TeacherSummary>(
    `/schools/${schoolId}/teachers/${teacherMembershipId}`,
    { method: "DELETE" },
  );
}

export function restoreTeacher(
  request: AuthenticatedRequest,
  schoolId: string,
  teacherMembershipId: string,
): Promise<TeacherSummary> {
  return request<TeacherSummary>(
    `/schools/${schoolId}/teachers/${teacherMembershipId}/restore`,
    { method: "POST" },
  );
}
