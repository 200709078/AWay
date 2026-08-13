/*
  This migration preserves legacy attendance data where possible:
  - ACTIVE attendances become SUBMITTED.
  - CANCELLED attendances become LOCKED and receive an audit record before the
    legacy cancellation columns are removed.
  - The legacy absent-only relation is expanded into a roster snapshot using
    the then-current class roster. Historical roster data was not available in
    the former model, so this is the best recoverable representation.
*/

-- CreateEnum
CREATE TYPE "AttendanceStudentStatus" AS ENUM ('PRESENT', 'ABSENT');

-- CreateEnum
CREATE TYPE "AttendanceEditRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'COMPLETED');

-- AlterTable
ALTER TABLE "AuditLog"
ADD COLUMN "actorMembershipId" TEXT,
ADD COLUMN "schoolId" TEXT;

-- Preserve the former cancellation event before removing its dedicated columns.
INSERT INTO "AuditLog" (
    "id",
    "schoolId",
    "actorUserId",
    "action",
    "entityType",
    "entityId",
    "metadata",
    "createdAt"
)
SELECT
    'migration-attendance-cancelled-' || "id",
    "schoolId",
    "cancelledByUserId",
    'ATTENDANCE_LEGACY_CANCELLED_IMPORTED',
    'Attendance',
    "id",
    jsonb_build_object('cancelledAt', "cancelledAt"),
    COALESCE("cancelledAt", "updatedAt")
FROM "Attendance"
WHERE "status" = 'CANCELLED';

-- AlterEnum
BEGIN;
CREATE TYPE "AttendanceStatus_new" AS ENUM ('SUBMITTED', 'LOCKED');
ALTER TABLE "Attendance" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Attendance"
ALTER COLUMN "status" TYPE "AttendanceStatus_new"
USING (
    CASE "status"::text
        WHEN 'ACTIVE' THEN 'SUBMITTED'
        WHEN 'CANCELLED' THEN 'LOCKED'
        ELSE 'SUBMITTED'
    END
)::"AttendanceStatus_new";
ALTER TYPE "AttendanceStatus" RENAME TO "AttendanceStatus_old";
ALTER TYPE "AttendanceStatus_new" RENAME TO "AttendanceStatus";
DROP TYPE "AttendanceStatus_old";
ALTER TABLE "Attendance" ALTER COLUMN "status" SET DEFAULT 'SUBMITTED';
COMMIT;

-- DropIndex
DROP INDEX "Parent_userId_key";

-- DropIndex
DROP INDEX "Student_userId_key";

-- AlterTable
ALTER TABLE "Attendance"
DROP COLUMN "cancelledAt",
DROP COLUMN "cancelledByUserId",
ADD COLUMN "classNameSnapshot" TEXT,
ADD COLUMN "exportedAt" TIMESTAMP(3),
ADD COLUMN "exportedByMembershipId" TEXT,
ADD COLUMN "exportedRevision" INTEGER,
ADD COLUMN "lessonEndMinuteSnapshot" INTEGER,
ADD COLUMN "lessonStartMinuteSnapshot" INTEGER,
ADD COLUMN "reviewLockedAt" TIMESTAMP(3),
ADD COLUMN "reviewLockedByMembershipId" TEXT,
ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "status" SET DEFAULT 'SUBMITTED';

-- Existing records receive recoverable snapshots from the old current-state model.
UPDATE "Attendance" AS attendance
SET
    "classNameSnapshot" = class_record."name",
    "lessonStartMinuteSnapshot" = (
        SELECT lesson_period."startMinute"
        FROM "SchoolLessonPeriod" AS lesson_period
        WHERE lesson_period."schoolId" = attendance."schoolId"
            AND lesson_period."lessonNumber" = attendance."lessonNumber"
            AND lesson_period."dayOfWeek" = CASE EXTRACT(ISODOW FROM attendance."lessonDate")::INTEGER
                WHEN 1 THEN 'MONDAY'::"DayOfWeek"
                WHEN 2 THEN 'TUESDAY'::"DayOfWeek"
                WHEN 3 THEN 'WEDNESDAY'::"DayOfWeek"
                WHEN 4 THEN 'THURSDAY'::"DayOfWeek"
                WHEN 5 THEN 'FRIDAY'::"DayOfWeek"
                WHEN 6 THEN 'SATURDAY'::"DayOfWeek"
                WHEN 7 THEN 'SUNDAY'::"DayOfWeek"
            END
    ),
    "lessonEndMinuteSnapshot" = (
        SELECT lesson_period."endMinute"
        FROM "SchoolLessonPeriod" AS lesson_period
        WHERE lesson_period."schoolId" = attendance."schoolId"
            AND lesson_period."lessonNumber" = attendance."lessonNumber"
            AND lesson_period."dayOfWeek" = CASE EXTRACT(ISODOW FROM attendance."lessonDate")::INTEGER
                WHEN 1 THEN 'MONDAY'::"DayOfWeek"
                WHEN 2 THEN 'TUESDAY'::"DayOfWeek"
                WHEN 3 THEN 'WEDNESDAY'::"DayOfWeek"
                WHEN 4 THEN 'THURSDAY'::"DayOfWeek"
                WHEN 5 THEN 'FRIDAY'::"DayOfWeek"
                WHEN 6 THEN 'SATURDAY'::"DayOfWeek"
                WHEN 7 THEN 'SUNDAY'::"DayOfWeek"
            END
    )
FROM "Class" AS class_record
WHERE class_record."id" = attendance."classId";

ALTER TABLE "Attendance"
ALTER COLUMN "classNameSnapshot" SET NOT NULL;

-- AlterTable
ALTER TABLE "School" ADD COLUMN "attendanceFinalizedThroughDate" DATE;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AttendanceStudentSnapshot" (
    "attendanceId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentNumber" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "status" "AttendanceStudentStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceStudentSnapshot_pkey" PRIMARY KEY ("attendanceId", "studentId")
);

-- CreateTable
CREATE TABLE "AttendanceEditRequest" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "requestedByMembershipId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AttendanceEditRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByMembershipId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "editGrantedAt" TIMESTAMP(3),
    "editExpiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceEditRequest_pkey" PRIMARY KEY ("id")
);

-- Expand legacy absent-only rows to current roster snapshots.
INSERT INTO "AttendanceStudentSnapshot" (
    "attendanceId",
    "studentId",
    "studentNumber",
    "firstName",
    "lastName",
    "status",
    "createdAt",
    "updatedAt"
)
SELECT
    attendance."id",
    student."id",
    student."number",
    student."firstName",
    student."lastName",
    CASE
        WHEN absent."studentId" IS NULL THEN 'PRESENT'::"AttendanceStudentStatus"
        ELSE 'ABSENT'::"AttendanceStudentStatus"
    END,
    attendance."createdAt",
    attendance."updatedAt"
FROM "Attendance" AS attendance
JOIN "Student" AS student
    ON student."classId" = attendance."classId"
    AND student."schoolId" = attendance."schoolId"
    AND student."deletedAt" IS NULL
LEFT JOIN "AttendanceAbsentStudent" AS absent
    ON absent."attendanceId" = attendance."id"
    AND absent."studentId" = student."id";

-- Preserve any legacy absence that no longer belongs to the current active roster.
INSERT INTO "AttendanceStudentSnapshot" (
    "attendanceId",
    "studentId",
    "studentNumber",
    "firstName",
    "lastName",
    "status",
    "createdAt",
    "updatedAt"
)
SELECT
    absent."attendanceId",
    student."id",
    student."number",
    student."firstName",
    student."lastName",
    'ABSENT'::"AttendanceStudentStatus",
    absent."createdAt",
    absent."createdAt"
FROM "AttendanceAbsentStudent" AS absent
JOIN "Student" AS student ON student."id" = absent."studentId"
ON CONFLICT ("attendanceId", "studentId") DO NOTHING;

-- DropForeignKey
ALTER TABLE "AttendanceAbsentStudent" DROP CONSTRAINT "AttendanceAbsentStudent_attendanceId_fkey";

-- DropForeignKey
ALTER TABLE "AttendanceAbsentStudent" DROP CONSTRAINT "AttendanceAbsentStudent_studentId_fkey";

-- DropTable
DROP TABLE "AttendanceAbsentStudent";

-- CreateIndex
CREATE INDEX "AttendanceStudentSnapshot_studentId_idx" ON "AttendanceStudentSnapshot"("studentId");

-- CreateIndex
CREATE INDEX "AttendanceStudentSnapshot_attendanceId_status_idx" ON "AttendanceStudentSnapshot"("attendanceId", "status");

-- CreateIndex
CREATE INDEX "AttendanceEditRequest_attendanceId_status_idx" ON "AttendanceEditRequest"("attendanceId", "status");

-- Only one unresolved edit request may exist for an attendance record.
CREATE UNIQUE INDEX "AttendanceEditRequest_onePendingPerAttendance_key"
ON "AttendanceEditRequest"("attendanceId")
WHERE "status" = 'PENDING';

-- CreateIndex
CREATE INDEX "AttendanceEditRequest_requestedByMembershipId_status_idx" ON "AttendanceEditRequest"("requestedByMembershipId", "status");

-- CreateIndex
CREATE INDEX "AttendanceEditRequest_reviewedByMembershipId_idx" ON "AttendanceEditRequest"("reviewedByMembershipId");

-- CreateIndex
CREATE INDEX "Attendance_reviewLockedByMembershipId_idx" ON "Attendance"("reviewLockedByMembershipId");

-- CreateIndex
CREATE INDEX "Attendance_exportedByMembershipId_idx" ON "Attendance"("exportedByMembershipId");

-- CreateIndex
CREATE INDEX "AuditLog_schoolId_createdAt_idx" ON "AuditLog"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorMembershipId_createdAt_idx" ON "AuditLog"("actorMembershipId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Parent_schoolId_userId_key" ON "Parent"("schoolId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_schoolId_userId_key" ON "Student"("schoolId", "userId");

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_reviewLockedByMembershipId_fkey" FOREIGN KEY ("reviewLockedByMembershipId") REFERENCES "SchoolMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_exportedByMembershipId_fkey" FOREIGN KEY ("exportedByMembershipId") REFERENCES "SchoolMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceStudentSnapshot" ADD CONSTRAINT "AttendanceStudentSnapshot_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceStudentSnapshot" ADD CONSTRAINT "AttendanceStudentSnapshot_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEditRequest" ADD CONSTRAINT "AttendanceEditRequest_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEditRequest" ADD CONSTRAINT "AttendanceEditRequest_requestedByMembershipId_fkey" FOREIGN KEY ("requestedByMembershipId") REFERENCES "SchoolMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEditRequest" ADD CONSTRAINT "AttendanceEditRequest_reviewedByMembershipId_fkey" FOREIGN KEY ("reviewedByMembershipId") REFERENCES "SchoolMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "SchoolMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
