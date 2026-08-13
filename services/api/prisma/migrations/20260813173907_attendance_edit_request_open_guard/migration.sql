DROP INDEX "AttendanceEditRequest_onePendingPerAttendance_key";

CREATE UNIQUE INDEX "AttendanceEditRequest_oneOpenPerAttendance_key"
ON "AttendanceEditRequest"("attendanceId")
WHERE "status" IN ('PENDING', 'APPROVED');
