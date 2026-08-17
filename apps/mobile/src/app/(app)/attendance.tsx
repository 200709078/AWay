import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { Redirect, router } from "expo-router";
import { AppScreen, EmptyState, LoadingView, Notice, Pill, PrimaryButton, uiStyles } from "@/components/ui";
import { AccountMenu } from "@/components/account-menu";
import { useAuth } from "@/features/auth/auth-context";
import { getAttendanceBoard, type AttendanceBoard, type AttendanceSummary } from "@/features/attendance/attendance-api";
import { getSchoolContext } from "@/features/schools/schools-api";
import { addDaysToBusinessDate, formatBusinessDate, formatTimeRange, todayInIstanbul } from "@/lib/date";
import { ApiError } from "@/lib/api";
import { colors, messageForError, roleLabel } from "@/lib/presentation";
import { isAttendanceRole } from "@/lib/types";

export default function AttendanceScreen() {
  const { request, selectedSchool, clearSelectedSchool } = useAuth();
  const [date, setDate] = useState(todayInIstanbul);
  const [board, setBoard] = useState<AttendanceBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const boardRequestSequenceRef = useRef(0);

  const schoolId = selectedSchool?.school.id;
  const selectedRoleCanTakeAttendance = selectedSchool
    ? isAttendanceRole(selectedSchool.selectedRole)
    : false;

  const loadBoard = useCallback(async () => {
    const requestSequence = boardRequestSequenceRef.current + 1;
    boardRequestSequenceRef.current = requestSequence;

    if (!schoolId || !selectedSchool || !isAttendanceRole(selectedSchool.selectedRole)) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setBoard(null);

    try {
      const context = await getSchoolContext(request, schoolId);

      if (
        !context.roles.some(isAttendanceRole) ||
        !isAttendanceRole(selectedSchool.selectedRole) ||
        !context.roles.includes(selectedSchool.selectedRole)
      ) {
        clearSelectedSchool();
        router.replace("/schools");
        return;
      }

      const nextBoard = await getAttendanceBoard(request, schoolId, date);

      if (requestSequence !== boardRequestSequenceRef.current) {
        return;
      }

      setBoard(nextBoard);
    } catch (loadError) {
      if (requestSequence !== boardRequestSequenceRef.current) {
        return;
      }

      if (loadError instanceof ApiError && loadError.status === 403) {
        clearSelectedSchool();
        router.replace("/schools");
        return;
      }

      setError(messageForError(loadError));
    } finally {
      if (requestSequence === boardRequestSequenceRef.current) {
        setIsLoading(false);
      }
    }
  }, [clearSelectedSchool, date, request, schoolId, selectedSchool]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const attendanceBySlot = useMemo(() => {
    const values = new Map<string, AttendanceSummary>();

    for (const attendance of board?.attendances ?? []) {
      values.set(`${attendance.classId}:${attendance.lessonNumber}`, attendance);
    }

    return values;
  }, [board]);

  const previousDay = () => {
    boardRequestSequenceRef.current += 1;
    setBoard(null);
    setError(null);
    setIsLoading(true);
    setDate((current) => addDaysToBusinessDate(current, -1));
  };

  const backToToday = () => {
    boardRequestSequenceRef.current += 1;
    setBoard(null);
    setError(null);
    setIsLoading(true);
    setDate(todayInIstanbul());
  };

  if (!selectedSchool || !selectedRoleCanTakeAttendance) {
    return <Redirect href="/schools" />;
  }

  if (isLoading && !board) {
    return (
      <AppScreen>
        <LoadingView label="Günlük yoklama panosu hazırlanıyor…" />
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={uiStyles.content}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={uiStyles.eyebrow}>{selectedSchool.school.name}</Text>
            <Text style={styles.pageTitle}>Yoklama Panosu</Text>
            <Text style={uiStyles.pageDescription}>{roleLabel(selectedSchool.selectedRole)}</Text>
          </View>
          <View style={styles.headerActions}>
            <AccountMenu />
          </View>
        </View>

        <View style={[uiStyles.card, styles.dateCard]}>
          <View style={styles.dateCopy}>
            <Text style={uiStyles.eyebrow}>Tarih</Text>
            <Text style={styles.dateTitle}>{formatBusinessDate(date)}</Text>
          </View>
          <View style={styles.dateActions}>
            <PrimaryButton label="← Önceki" tone="secondary" onPress={previousDay} />
            {date !== todayInIstanbul() ? (
              <PrimaryButton label="Bugün" tone="ghost" onPress={backToToday} />
            ) : null}
          </View>
        </View>

        {error ? (
          <EmptyState
            title="Pano yüklenemedi"
            detail={error}
            action={<PrimaryButton label="Tekrar dene" onPress={() => void loadBoard()} />}
          />
        ) : null}

        {board?.isFinalized ? (
          <Notice tone="warning">
            Bu gün kesinleşti. Yeni yoklama alınamaz; mevcut kayıtların ayrıntısını yine açabilirsiniz.
          </Notice>
        ) : null}

        {board && !board.classes.length ? (
          <EmptyState
            title="Henüz sınıf yok"
            detail="Yoklama almadan önce yönetici web arayüzünden en az bir aktif sınıf tanımlanmalıdır."
          />
        ) : null}

        {board && board.classes.length > 0 && board.lessonPeriods.length === 0 ? (
          <EmptyState
            title="Bu gün için ders saati yok"
            detail="Yoklama alınabilmesi için yöneticinin bu günün ders saatlerini tanımlaması gerekir."
          />
        ) : null}

        {board?.classes.map((schoolClass) => (
          <View key={schoolClass.id} style={[uiStyles.card, styles.classCard]}>
            <View style={styles.classHeading}>
              <Text style={styles.className}>{schoolClass.name}</Text>
              <Text style={uiStyles.muted}>Ders seçin</Text>
            </View>
            <View style={styles.slots}>
              {board.lessonPeriods.map((period) => {
                const attendance = attendanceBySlot.get(`${schoolClass.id}:${period.lessonNumber}`);
                const canCreate = !board.isFinalized;

                return (
                  <AttendanceSlot
                    key={period.id}
                    attendance={attendance}
                    disabled={!attendance && !canCreate}
                    lessonNumber={period.lessonNumber}
                    timeRange={formatTimeRange(period.startMinute, period.endMinute)}
                    onPress={() => {
                      if (attendance) {
                        router.push({ pathname: "/attendance-detail", params: { attendanceId: attendance.id } });
                        return;
                      }

                      if (canCreate) {
                        router.push({
                          pathname: "/take-attendance",
                          params: {
                            classId: schoolClass.id,
                            date,
                            lessonNumber: String(period.lessonNumber),
                          },
                        });
                      }
                    }}
                  />
                );
              })}
            </View>
          </View>
        ))}

        {board ? <PrimaryButton label="Panoyu yenile" tone="secondary" loading={isLoading} onPress={() => void loadBoard()} /> : null}
      </ScrollView>
    </AppScreen>
  );
}

function AttendanceSlot({
  attendance,
  disabled,
  lessonNumber,
  timeRange,
  onPress,
}: {
  attendance: AttendanceSummary | undefined;
  disabled: boolean;
  lessonNumber: number;
  timeRange: string;
  onPress: () => void;
}) {
  const label = attendance
    ? attendance.isFinalized
      ? "Kesinleşti"
      : attendance.status === "LOCKED"
        ? "İnceleme kilitli"
        : "Gönderildi"
    : disabled
      ? "Kesinleşmiş gün"
      : "Yoklama al";
  const tone = attendance?.isFinalized
    ? "neutral"
    : attendance?.status === "LOCKED"
      ? "warning"
      : attendance
        ? "success"
        : "brand";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.slot, disabled && styles.slotDisabled, pressed && !disabled && styles.slotPressed]}
    >
      <View style={styles.slotCopy}>
        <Text style={styles.slotTitle}>{lessonNumber}. ders</Text>
        <Text style={uiStyles.muted}>{timeRange}</Text>
        {attendance ? (
          <Text style={styles.slotDetail}>
            {attendance.absentCount} devamsız · {attendance.studentCount - attendance.absentCount} mevcut
          </Text>
        ) : null}
      </View>
      <Pill label={label} tone={tone} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "flex-start", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  headerCopy: { flex: 1, gap: 5 },
  pageTitle: { color: colors.ink, fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  headerActions: { alignItems: "flex-end", gap: 0 },
  dateCard: { gap: 14 },
  dateCopy: { gap: 3 },
  dateTitle: { color: colors.ink, fontSize: 20, fontWeight: "700", textTransform: "capitalize" },
  dateActions: { alignItems: "flex-start", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  classCard: { gap: 14 },
  classHeading: { gap: 3 },
  className: { color: colors.ink, fontSize: 21, fontWeight: "800" },
  slots: { gap: 8 },
  slot: { alignItems: "center", backgroundColor: "#FBFCFA", borderColor: colors.border, borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 12, justifyContent: "space-between", minHeight: 74, padding: 12 },
  slotCopy: { flex: 1, gap: 2 },
  slotTitle: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  slotDetail: { color: colors.muted, fontSize: 13 },
  slotDisabled: { opacity: 0.52 },
  slotPressed: { backgroundColor: "#EDF5F2" },
});
