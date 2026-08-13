import { createBrowserRouter, Navigate } from "react-router";
import { AuthenticatedLayout, SchoolShell } from "./features/app/app-shell";
import { HomePage } from "./features/app/home-page";
import { SchoolSelectionPage } from "./features/app/school-selection-page";
import { SignInPage } from "./features/auth/sign-in-page";
import { AttendancePage } from "./features/attendance/attendance-page";
import { ClassesPage } from "./features/classes/classes-page";
import { LessonPeriodsPage } from "./features/lesson-periods/lesson-periods-page";
import { StudentsPage } from "./features/students/students-page";
import { TeachersPage } from "./features/teachers/teachers-page";

export const router = createBrowserRouter([
  {
    path: "/sign-in",
    element: <SignInPage />,
  },
  {
    element: <AuthenticatedLayout />,
    children: [
      { index: true, element: <Navigate to="/select-school" replace /> },
      { path: "select-school", element: <SchoolSelectionPage /> },
      {
        path: "schools/:schoolId",
        element: <SchoolShell />,
        children: [
          { path: "dashboard", element: <HomePage /> },
          { path: "attendances", element: <AttendancePage /> },
          { path: "classes", element: <ClassesPage /> },
          { path: "students", element: <StudentsPage /> },
          { path: "teachers", element: <TeachersPage /> },
          { path: "lesson-periods", element: <LessonPeriodsPage /> },
        ],
      },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/select-school" replace />,
  },
]);
