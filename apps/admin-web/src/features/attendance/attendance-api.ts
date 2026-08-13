import type { AuthenticatedRequest } from "../auth/auth-context";

export type AttendanceStatus = "SUBMITTED" | "LOCKED";
export type AttendanceStudentStatus = "PRESENT" | "ABSENT";
export type AttendanceEditRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "COMPLETED";
export type DayOfWeek =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export interface AttendanceSummary {
  id: string;
  classId: string;
  className: string;
  lessonDate: string;
  lessonNumber: number;
  lessonStartMinute: number | null;
  lessonEndMinute: number | null;
  status: AttendanceStatus;
  revision: number;
  submittedAt: string;
  reviewLockedAt: string | null;
  updatedAt: string;
  absentStudentNumbers: number[];
  absentCount: number;
  studentCount: number;
  isFinalized: boolean;
  hasOpenEditRequest: boolean;
  canEdit: boolean;
  canRequestEdit: boolean;
  canReviewLock: boolean;
}

export interface AttendanceBoard {
  date: string;
  dayOfWeek: DayOfWeek;
  finalizedThroughDate: string | null;
  isFinalized: boolean;
  classes: Array<{ id: string; name: string }>;
  lessonPeriods: Array<{
    id: string;
    lessonNumber: number;
    startMinute: number;
    endMinute: number;
  }>;
  attendances: AttendanceSummary[];
}

export interface AttendanceEntryContext {
  date: string;
  dayOfWeek: DayOfWeek;
  class: { id: string; name: string };
  lessonPeriod: {
    lessonNumber: number;
    startMinute: number;
    endMinute: number;
  };
  students: Array<{
    number: number;
    firstName: string;
    lastName: string;
  }>;
  existingAttendanceId: string | null;
}

export interface AttendanceEditRequest {
  id: string;
  requestedBy: {
    role: "ADMIN" | "TEACHER";
    firstName: string;
    lastName: string;
  };
  reason: string;
  status: AttendanceEditRequestStatus;
  requestedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  editGrantedAt: string | null;
  editExpiresAt: string | null;
  completedAt: string | null;
}

export interface AttendanceDetail extends AttendanceSummary {
  submittedBy: {
    role: "ADMIN" | "TEACHER";
    firstName: string;
    lastName: string;
  };
  reviewLockedBy: {
    role: "ADMIN" | "TEACHER";
    firstName: string;
    lastName: string;
  } | null;
  students: Array<{
    number: number;
    firstName: string;
    lastName: string;
    status: AttendanceStudentStatus;
  }>;
  editPermissionExpiresAt: string | null;
  ownOpenEditRequest: AttendanceEditRequest | null;
  pendingEditRequests?: AttendanceEditRequest[];
}

export interface CreateAttendanceInput {
  classId: string;
  lessonDate: string;
  lessonNumber: number;
  absentStudentNumbers: number[];
}

export function getAttendanceBoard(
  request: AuthenticatedRequest,
  schoolId: string,
  date: string,
): Promise<AttendanceBoard> {
  return request<AttendanceBoard>(
    `/schools/${schoolId}/attendances/board?date=${encodeURIComponent(date)}`,
  );
}

export function getAttendanceEntryContext(
  request: AuthenticatedRequest,
  schoolId: string,
  input: Pick<CreateAttendanceInput, "classId" | "lessonDate" | "lessonNumber">,
): Promise<AttendanceEntryContext> {
  const query = new URLSearchParams({
    classId: input.classId,
    date: input.lessonDate,
    lessonNumber: String(input.lessonNumber),
  });

  return request<AttendanceEntryContext>(
    `/schools/${schoolId}/attendances/entry-context?${query.toString()}`,
  );
}

export function createAttendance(
  request: AuthenticatedRequest,
  schoolId: string,
  input: CreateAttendanceInput,
): Promise<AttendanceSummary> {
  return request<AttendanceSummary>(`/schools/${schoolId}/attendances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function getAttendanceDetail(
  request: AuthenticatedRequest,
  schoolId: string,
  attendanceId: string,
): Promise<AttendanceDetail> {
  return request<AttendanceDetail>(
    `/schools/${schoolId}/attendances/${attendanceId}`,
  );
}

export function updateAttendance(
  request: AuthenticatedRequest,
  schoolId: string,
  attendanceId: string,
  input: { expectedRevision: number; absentStudentNumbers: number[] },
): Promise<AttendanceSummary> {
  return request<AttendanceSummary>(
    `/schools/${schoolId}/attendances/${attendanceId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function reviewLockAttendance(
  request: AuthenticatedRequest,
  schoolId: string,
  attendanceId: string,
): Promise<AttendanceSummary> {
  return request<AttendanceSummary>(
    `/schools/${schoolId}/attendances/${attendanceId}/review-lock`,
    { method: "POST" },
  );
}

export function createAttendanceEditRequest(
  request: AuthenticatedRequest,
  schoolId: string,
  attendanceId: string,
  reason: string,
): Promise<AttendanceEditRequest> {
  return request<AttendanceEditRequest>(
    `/schools/${schoolId}/attendances/${attendanceId}/edit-requests`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    },
  );
}

export function getAttendanceEditRequests(
  request: AuthenticatedRequest,
  schoolId: string,
  attendanceId: string,
): Promise<AttendanceEditRequest[]> {
  return request<AttendanceEditRequest[]>(
    `/schools/${schoolId}/attendances/${attendanceId}/edit-requests`,
  );
}

function reviewAttendanceEditRequest(
  request: AuthenticatedRequest,
  schoolId: string,
  attendanceId: string,
  requestId: string,
  decision: "approve" | "reject",
  note?: string,
): Promise<AttendanceEditRequest> {
  return request<AttendanceEditRequest>(
    `/schools/${schoolId}/attendances/${attendanceId}/edit-requests/${requestId}/${decision}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(note?.trim() ? { note: note.trim() } : {}),
    },
  );
}

export function approveAttendanceEditRequest(
  request: AuthenticatedRequest,
  schoolId: string,
  attendanceId: string,
  requestId: string,
  note?: string,
): Promise<AttendanceEditRequest> {
  return reviewAttendanceEditRequest(
    request,
    schoolId,
    attendanceId,
    requestId,
    "approve",
    note,
  );
}

export function rejectAttendanceEditRequest(
  request: AuthenticatedRequest,
  schoolId: string,
  attendanceId: string,
  requestId: string,
  note?: string,
): Promise<AttendanceEditRequest> {
  return reviewAttendanceEditRequest(
    request,
    schoolId,
    attendanceId,
    requestId,
    "reject",
    note,
  );
}
