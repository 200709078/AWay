import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { AppScreen, EmptyState, LoadingView, Notice, Pill, PrimaryButton, uiStyles } from "@/components/ui";
import { AccountMenu } from "@/components/account-menu";
import { useAuth } from "@/features/auth/auth-context";
import {
  createAttendance,
  getAttendanceEntryContext,
  type AttendanceEntryContext,
  type AttendanceSummary,
} from "@/features/attendance/attendance-api";
import { formatBusinessDate, formatTimeRange } from "@/lib/date";
import { ApiError } from "@/lib/api";
import { colors, messageForError } from "@/lib/presentation";
import { isAttendanceRole } from "@/lib/types";

export default function TakeAttendanceScreen() {
  const params = useLocalSearchParams<{
    classId?: string;
    date?: string;
    lessonNumber?: string;
  }>();
  const { request, selectedSchool, clearSelectedSchool } = useAuth();
  const [context, setContext] = useState<AttendanceEntryContext | null>(null);
  const [absentNumbers, setAbsentNumbers] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<AttendanceSummary | null>(null);
  const [showBoardRefreshAction, setShowBoardRefreshAction] = useState(false);

  const classId = firstRouteValue(params.classId);
  const date = firstRouteValue(params.date);
  const lessonNumber = Number(firstRouteValue(params.lessonNumber));
  const validRoute = Boolean(classId && date && Number.isInteger(lessonNumber) && lessonNumber > 0);
  const selectedRoleCanTakeAttendance = selectedSchool
    ? isAttendanceRole(selectedSchool.selectedRole)
    : false;

  const loadContext = useCallback(async () => {
    if (
      !selectedSchool ||
      !selectedRoleCanTakeAttendance ||
      !validRoute ||
      !classId ||
      !date
    ) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextContext = await getAttendanceEntryContext(request, selectedSchool.school.id, {
        classId,
        lessonDate: date,
        lessonNumber,
      });

      if (nextContext.existingAttendanceId) {
        router.replace({
          pathname: "/attendance-detail",
          params: { attendanceId: nextContext.existingAttendanceId },
        });
        return;
      }

      setContext(nextContext);
      setAbsentNumbers(new Set());
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 403) {
        clearSelectedSchool();
        router.replace("/schools");
        return;
      }

      setError(messageForError(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [
    classId,
    clearSelectedSchool,
    date,
    lessonNumber,
    request,
    selectedRoleCanTakeAttendance,
    selectedSchool,
    validRoute,
  ]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const absentStudentNumbers = useMemo(
    () => [...absentNumbers].sort((left, right) => left - right),
    [absentNumbers],
  );

  const toggleAbsent = (number: number) => {
    if (isSubmitting) {
      return;
    }

    setAbsentNumbers((current) => {
      const next = new Set(current);

      if (next.has(number)) {
        next.delete(number);
      } else {
        next.add(number);
      }

      return next;
    });
  };

  const submit = async () => {
    if (!selectedSchool || !context) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setShowBoardRefreshAction(false);
    let createWasAttempted = false;

    try {
      const latestContext = await getAttendanceEntryContext(
        request,
        selectedSchool.school.id,
        {
          classId: context.class.id,
          lessonDate: context.date,
          lessonNumber: context.lessonPeriod.lessonNumber,
        },
      );

      if (latestContext.existingAttendanceId) {
        router.replace({
          pathname: "/attendance-detail",
          params: { attendanceId: latestContext.existingAttendanceId },
        });
        return;
      }

      const previousRoster = context.students.map((student) => student.number).join(",");
      const latestRoster = latestContext.students.map((student) => student.number).join(",");

      if (previousRoster !== latestRoster) {
        const latestNumbers = new Set(latestContext.students.map((student) => student.number));
        setContext(latestContext);
        setAbsentNumbers((current) =>
          new Set([...current].filter((number) => latestNumbers.has(number))),
        );
        setError(
          "Sınıf listesi değişti. Güncel liste yüklendi; göndermeden önce tekrar kontrol edin.",
        );
        return;
      }

      createWasAttempted = true;
      const result = await createAttendance(request, selectedSchool.school.id, {
        classId: latestContext.class.id,
        lessonDate: latestContext.date,
        lessonNumber: latestContext.lessonPeriod.lessonNumber,
        absentStudentNumbers,
      });
      setSubmitted(result);
    } catch (submitError) {
      setError(messageForError(submitError));
      setShowBoardRefreshAction(createWasAttempted);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (
    !selectedSchool ||
    !selectedRoleCanTakeAttendance
  ) {
    return <Redirect href="/schools" />;
  }

  if (!validRoute) {
    return (
      <AppScreen>
        <EmptyState
          title="Yoklama bilgisi eksik"
          detail="Sınıf ve ders seçimini panodan yeniden yapın."
          action={<PrimaryButton label="Panoya dön" onPress={() => router.replace("/attendance")} />}
        />
      </AppScreen>
    );
  }

  if (isLoading && !context) {
    return (
      <AppScreen>
        <LoadingView label="Yoklama listesi hazırlanıyor…" />
      </AppScreen>
    );
  }

  if (submitted) {
    return (
      <AppScreen>
        <ScrollView contentContainerStyle={[uiStyles.content, styles.resultContent]}>
          <View style={[uiStyles.card, styles.resultCard]}>
            <Pill label="Gönderildi" tone="success" />
            <Text style={styles.resultTitle}>Yoklama kaydedildi</Text>
            <Text style={uiStyles.pageDescription}>
              {submitted.className} · {submitted.lessonNumber}. ders · {formatBusinessDate(submitted.lessonDate)}
            </Text>
            <View style={styles.resultNumbers}>
              <Text style={styles.resultNumber}>{submitted.absentCount}</Text>
              <Text style={styles.resultNumberLabel}>devamsız öğrenci</Text>
              <Text style={styles.resultNumber}>{submitted.studentCount - submitted.absentCount}</Text>
              <Text style={styles.resultNumberLabel}>mevcut öğrenci</Text>
            </View>
            <Notice tone="information">
              Kayıt silinmez. İnceleme kilidi veya kesinleşme durumunu ayrıntı ekranından takip edebilirsiniz.
            </Notice>
            <PrimaryButton
              label="Yoklama ayrıntısını aç"
              onPress={() => router.replace({ pathname: "/attendance-detail", params: { attendanceId: submitted.id } })}
            />
            <PrimaryButton label="Panoya dön" tone="secondary" onPress={() => router.replace("/attendance")} />
          </View>
        </ScrollView>
      </AppScreen>
    );
  }

  if (!context) {
    return (
      <AppScreen>
        <View style={styles.centeredContent}>
          <EmptyState
            title="Yoklama listesi açılamadı"
            detail={error ?? "Yoklama listesi bulunamadı."}
            action={
              <>
                <PrimaryButton label="Tekrar dene" onPress={() => void loadContext()} />
                <View style={{ height: 8 }} />
                <PrimaryButton label="Panoya dön" tone="ghost" onPress={() => router.replace("/attendance")} />
              </>
            }
          />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={uiStyles.content}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={uiStyles.eyebrow}>{context.class.name}</Text>
            <Text style={uiStyles.pageTitle}>Yoklama al</Text>
            <Text style={uiStyles.pageDescription}>
              {formatBusinessDate(context.date)} · {context.lessonPeriod.lessonNumber}. ders · {formatTimeRange(context.lessonPeriod.startMinute, context.lessonPeriod.endMinute)}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <AccountMenu />
            <PrimaryButton label="Pano" tone="ghost" onPress={() => router.replace("/attendance")} />
          </View>
        </View>

        <Notice tone="information">
          Devamsız olan öğrencileri işaretleyin. Hiç kimseyi işaretlemezseniz herkes mevcut olarak gönderilir.
        </Notice>

        <View style={[uiStyles.card, styles.summaryCard]}>
          <View>
            <Text style={styles.summaryValue}>{absentStudentNumbers.length}</Text>
            <Text style={uiStyles.muted}>devamsız</Text>
          </View>
          <View>
            <Text style={styles.summaryValue}>{context.students.length - absentStudentNumbers.length}</Text>
            <Text style={uiStyles.muted}>mevcut</Text>
          </View>
          <View>
            <Text style={styles.summaryValue}>{context.students.length}</Text>
            <Text style={uiStyles.muted}>toplam</Text>
          </View>
        </View>

        <View style={[uiStyles.card, styles.studentsCard]}>
          <Text style={uiStyles.sectionTitle}>Sınıf listesi</Text>
          <View style={styles.studentList}>
            {context.students.map((student) => {
              const isAbsent = absentNumbers.has(student.number);

              return (
                <Pressable
                  key={student.number}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isAbsent }}
                  disabled={isSubmitting}
                  onPress={() => toggleAbsent(student.number)}
                  style={({ pressed }) => [styles.studentRow, isAbsent && styles.studentRowAbsent, pressed && styles.studentRowPressed]}
                >
                  <View style={[styles.checkbox, isAbsent && styles.checkboxChecked]}>
                    {isAbsent ? <Text style={styles.checkboxMark}>✓</Text> : null}
                  </View>
                  <Text style={styles.studentNumber}>{student.number}</Text>
                  <Text style={styles.studentName}>{student.firstName} {student.lastName}</Text>
                  <Text style={[styles.studentStatus, isAbsent && styles.studentStatusAbsent]}>
                    {isAbsent ? "Devamsız" : "Mevcut"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {error ? <Notice tone="danger">{error}</Notice> : null}
        {showBoardRefreshAction ? (
          <PrimaryButton label="Panoyu yenile ve sonucu kontrol et" tone="secondary" onPress={() => router.replace("/attendance")} />
        ) : (
          <PrimaryButton
            label={absentStudentNumbers.length ? `${absentStudentNumbers.length} devamsızla gönder` : "Herkes mevcut olarak gönder"}
            loading={isSubmitting}
            onPress={() => void submit()}
          />
        )}
        <Text style={styles.onlineOnly}>
          Bu ilk sürüm çevrimiçi çalışır. Gönderim sırasında bağlantı kesilirse otomatik tekrar yapılmaz; panodan sonucu yenileyin.
        </Text>
      </ScrollView>
    </AppScreen>
  );
}

function firstRouteValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
}

const styles = StyleSheet.create({
  header: { alignItems: "flex-start", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  headerCopy: { flex: 1, gap: 5 },
  headerActions: { alignItems: "flex-end", gap: 8 },
  summaryCard: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 18 },
  summaryValue: { color: colors.ink, fontSize: 25, fontWeight: "800", textAlign: "center" },
  studentsCard: { gap: 14 },
  studentList: { borderTopColor: colors.border, borderTopWidth: 1 },
  studentRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: 10, minHeight: 56, paddingVertical: 8 },
  studentRowAbsent: { backgroundColor: "#FFF7F5" },
  studentRowPressed: { opacity: 0.7 },
  checkbox: { alignItems: "center", borderColor: colors.border, borderRadius: 6, borderWidth: 1, height: 24, justifyContent: "center", width: 24 },
  checkboxChecked: { backgroundColor: colors.danger, borderColor: colors.danger },
  checkboxMark: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  studentNumber: { color: colors.muted, fontSize: 13, fontWeight: "700", minWidth: 34, textAlign: "right" },
  studentName: { color: colors.ink, flex: 1, fontSize: 15, fontWeight: "600" },
  studentStatus: { color: colors.success, fontSize: 12, fontWeight: "700" },
  studentStatusAbsent: { color: colors.danger },
  onlineOnly: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center" },
  centeredContent: { flex: 1, justifyContent: "center", padding: 20 },
  resultContent: { justifyContent: "center" },
  resultCard: { alignItems: "center", gap: 14, marginTop: 80 },
  resultTitle: { color: colors.ink, fontSize: 26, fontWeight: "800", textAlign: "center" },
  resultNumbers: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", justifyContent: "center", rowGap: 2 },
  resultNumber: { color: colors.brand, fontSize: 25, fontWeight: "800", marginHorizontal: 5 },
  resultNumberLabel: { color: colors.muted, fontSize: 13, marginRight: 10 },
});
