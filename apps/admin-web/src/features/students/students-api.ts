import type { AuthenticatedRequest } from "../auth/auth-context";

export type StudentStatus = "active" | "archived";
export type StudentAccountStatus =
  | "NOT_PROVISIONED"
  | "UNVERIFIED"
  | "VERIFIED";

export interface StudentSummary {
  id: string;
  number: number;
  firstName: string;
  lastName: string;
  address: string | null;
  class: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  account: {
    status: StudentAccountStatus;
    phoneMasked?: string;
  };
}

export interface StudentsPage {
  items: StudentSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export interface StudentListOptions {
  status: StudentStatus;
  classId?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export interface CreateStudentInput {
  classId: string;
  number: number;
  firstName: string;
  lastName: string;
  phone?: string;
  address?: string;
}

export interface UpdateStudentInput {
  classId: string;
  number: number;
  firstName: string;
  lastName: string;
  address?: string;
}

export function getStudents(
  request: AuthenticatedRequest,
  schoolId: string,
  options: StudentListOptions,
): Promise<StudentsPage> {
  const query = new URLSearchParams({
    status: options.status,
    page: String(options.page),
    pageSize: String(options.pageSize),
  });

  if (options.classId) {
    query.set("classId", options.classId);
  }

  if (options.search) {
    query.set("q", options.search);
  }

  return request<StudentsPage>(`/schools/${schoolId}/students?${query}`);
}

export function createStudent(
  request: AuthenticatedRequest,
  schoolId: string,
  input: CreateStudentInput,
): Promise<StudentSummary> {
  return request<StudentSummary>(`/schools/${schoolId}/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateStudent(
  request: AuthenticatedRequest,
  schoolId: string,
  studentId: string,
  input: UpdateStudentInput,
): Promise<StudentSummary> {
  return request<StudentSummary>(`/schools/${schoolId}/students/${studentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function provisionStudentAccount(
  request: AuthenticatedRequest,
  schoolId: string,
  studentId: string,
  phone: string,
): Promise<StudentSummary> {
  return request<StudentSummary>(
    `/schools/${schoolId}/students/${studentId}/provision-account`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    },
  );
}

export function archiveStudent(
  request: AuthenticatedRequest,
  schoolId: string,
  studentId: string,
): Promise<StudentSummary> {
  return request<StudentSummary>(`/schools/${schoolId}/students/${studentId}`, {
    method: "DELETE",
  });
}

export function restoreStudent(
  request: AuthenticatedRequest,
  schoolId: string,
  studentId: string,
): Promise<StudentSummary> {
  return request<StudentSummary>(
    `/schools/${schoolId}/students/${studentId}/restore`,
    { method: "POST" },
  );
}
