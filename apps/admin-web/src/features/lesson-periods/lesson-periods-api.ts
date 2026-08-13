import type { AuthenticatedRequest } from "../auth/auth-context";

export type DayOfWeek =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export interface LessonPeriodSummary {
  id: string;
  dayOfWeek: DayOfWeek;
  lessonNumber: number;
  startMinute: number;
  endMinute: number;
  createdAt: string;
  updatedAt: string;
}

export interface LessonPeriodInput {
  dayOfWeek: DayOfWeek;
  lessonNumber: number;
  startMinute: number;
  endMinute: number;
}

export function getLessonPeriods(
  request: AuthenticatedRequest,
  schoolId: string,
): Promise<LessonPeriodSummary[]> {
  return request<LessonPeriodSummary[]>(
    `/schools/${schoolId}/lesson-periods`,
  );
}

export function createLessonPeriod(
  request: AuthenticatedRequest,
  schoolId: string,
  input: LessonPeriodInput,
): Promise<LessonPeriodSummary> {
  return request<LessonPeriodSummary>(`/schools/${schoolId}/lesson-periods`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateLessonPeriod(
  request: AuthenticatedRequest,
  schoolId: string,
  lessonPeriodId: string,
  input: Partial<LessonPeriodInput>,
): Promise<LessonPeriodSummary> {
  return request<LessonPeriodSummary>(
    `/schools/${schoolId}/lesson-periods/${lessonPeriodId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function deleteLessonPeriod(
  request: AuthenticatedRequest,
  schoolId: string,
  lessonPeriodId: string,
): Promise<LessonPeriodSummary> {
  return request<LessonPeriodSummary>(
    `/schools/${schoolId}/lesson-periods/${lessonPeriodId}`,
    { method: "DELETE" },
  );
}
