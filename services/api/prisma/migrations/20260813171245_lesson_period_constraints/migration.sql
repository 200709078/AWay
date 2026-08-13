CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "SchoolLessonPeriod"
  ADD CONSTRAINT "SchoolLessonPeriod_lesson_number_check"
    CHECK ("lessonNumber" >= 1),
  ADD CONSTRAINT "SchoolLessonPeriod_minute_range_check"
    CHECK (
      "startMinute" >= 0
      AND "startMinute" < "endMinute"
      AND "endMinute" <= 1440
    );

ALTER TABLE "SchoolLessonPeriod"
  ADD CONSTRAINT "SchoolLessonPeriod_no_overlap"
    EXCLUDE USING gist (
      "schoolId" WITH =,
      "dayOfWeek" WITH =,
      int4range("startMinute", "endMinute", '[)') WITH &&
    );
