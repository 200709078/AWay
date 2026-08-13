import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { AppScreen, EmptyState, LoadingView, Notice, Pill, PrimaryButton, uiStyles } from "@/components/ui";
import { useAuth } from "@/features/auth/auth-context";
import {
  createAttendanceEditRequest,
  getAttendanceDetail,
  reviewLockAttendance,
  updateAttendance,
  type AttendanceDetail,
} from "@/features/attendance/attendance-api";
import { formatBusinessDate, formatTimeRange, formatTimestamp } from "@/lib/date";
import { ApiError } from "@/lib/api";
import { colors, messageForError } from "@/lib/presentation";
import { isAttendanceRole } from "@/lib/types";

export default function AttendanceDetailScreen() {
  const params = useLocalSearchParams<{ attendanceId?: string }>();
  const { request, selectedSchool, clearSelectedSchool } = useAuth();
  const [detail, setDetail] = useState<AttendanceDetail | null>(null);
  const [absentNumbers, setAbsentNumbers] = useState<Set<number>>(new Set());
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [operation, setOperation] = useState<"save" | "lock" | "request" | null>(null);

  const attendanceId = firstRouteValue(params.attendanceId);
  const selectedRoleCanTakeAttendance = selectedSchool
    ? isAttendanceRole(selectedSchool.selectedRole)
    : false;

  const loadDetail = useCallback(async () => {
    if (!selectedSchool || !selectedRoleCanTakeAttendance || !attendanceId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextDetail = await getAttendanceDetail(request, selectedSchool.school.id, attendanceId);
      setDetail(nextDetail);
      setAbsentNumbers(
        new Set(
          nextDetail.students
            .filter((student) => student.status === "ABSENT")
            .map((student) => student.number),
        ),
      );
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
    attendanceId,
    clearSelectedSchool,
    request,
    selectedRoleCanTakeAttendance,
    selectedSchool,
  ]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const absentStudentNumbers = useMemo(
    () => [...absentNumbers].sort((left, right) => left - right),
    [absentNumbers],
  );

  const toggleAbsent = (number: number) => {
    if (!detail?.canEdit || operation) {
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

  const save = async () => {
    if (!detail || !selectedSchool || !attendanceId) {
      return;
    }

    setOperation("save");
    setError(null);
    setNotice(null);

    try {
      await updateAttendance(request, selectedSchool.school.id, attendanceId, {
        expectedRevision: detail.revision,
        absentStudentNumbers,
      });
      setNotice("Devamsızlık listesi güncellendi.");
      await loadDetail();
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 409) {
        await loadDetail();
        setNotice("Yoklama durumu değişti. Güncel kayıt yeniden yüklendi.");
        return;
      }

      setError(messageForError(saveError));
    } finally {
      setOperation(null);
    }
  };

  const lockForReview = async () => {
    if (!detail || !selectedSchool || !attendanceId) {
      return;
    }

    setOperation("lock");
    setError(null);
    setNotice(null);

    try {
      await reviewLockAttendance(request, selectedSchool.school.id, attendanceId);
      setNotice("Yoklama inceleme kilidine alındı.");
      await loadDetail();
    } catch (lockError) {
      if (lockError instanceof ApiError && lockError.status === 409) {
        await loadDetail();
        setNotice("Yoklama durumu değişti. Güncel kayıt yeniden yüklendi.");
        return;
      }

      setError(messageForError(lockError));
    } finally {
      setOperation(null);
    }
  };

  const requestEdit = async () => {
    if (!detail || !selectedSchool || !attendanceId || reason.trim().length < 3) {
      return;
    }

    setOperation("request");
    setError(null);
    setNotice(null);

    try {
      await createAttendanceEditRequest(
        request,
        selectedSchool.school.id,
        attendanceId,
        reason.trim(),
      );
      setReason("");
      setNotice("Düzenleme talebi yöneticinin yoklama kuyruğuna gönderildi.");
      await loadDetail();
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 409) {
        await loadDetail();
        setNotice("Açık düzenleme talebi veya yoklama durumu yeniden yüklendi.");
        return;
      }

      setError(messageForError(requestError));
    } finally {
      setOperation(null);
    }
  };

  if (
    !selectedSchool ||
    !selectedRoleCanTakeAttendance
  ) {
    return <Redirect href="/schools" />;
  }

  if (!attendanceId) {
    return (
      <AppScreen>
        <EmptyState
          title="Yoklama bulunamadı"
          detail="Panodan bir yoklama seçerek tekrar deneyin."
          action={<PrimaryButton label="Panoya dön" onPress={() => router.replace("/attendance")} />}
        />
      </AppScreen>
    );
  }

  if (isLoading && !detail) {
    return (
      <AppScreen>
        <LoadingView label="Yoklama ayrıntısı yükleniyor…" />
      </AppScreen>
    );
  }

  if (!detail) {
    return (
      <AppScreen>
        <View style={styles.centeredContent}>
          <EmptyState
            title="Yoklama ayrılamadı"
            detail={error ?? "Kayıt artık erişilebilir olmayabilir."}
            action={
              <>
                <PrimaryButton label="Tekrar dene" onPress={() => void loadDetail()} />
                <View style={{ height: 8 }} />
                <PrimaryButton label="Panoya dön" tone="ghost" onPress={() => router.replace("/attendance")} />
              </>
            }
          />
        </View>
      </AppScreen>
    );
  }

  const state = describeAttendanceState(detail);

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={uiStyles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={uiStyles.eyebrow}>{detail.className}</Text>
            <Text style={uiStyles.pageTitle}>Yoklama ayrıntısı</Text>
            <Text style={uiStyles.pageDescription}>
              {formatBusinessDate(detail.lessonDate)} · {detail.lessonNumber}. ders · {formatTimeRange(detail.lessonStartMinute, detail.lessonEndMinute)}
            </Text>
          </View>
          <PrimaryButton label="Pano" tone="ghost" onPress={() => router.replace("/attendance")} />
        </View>

        <View style={[uiStyles.card, styles.stateCard]}>
          <Pill label={state.label} tone={state.tone} />
          <Text style={styles.stateTitle}>{state.title}</Text>
          <Text style={uiStyles.muted}>{state.detail}</Text>
          <View style={styles.metaGrid}>
            <Meta label="Gönderen" value={`${detail.submittedBy.firstName} ${detail.submittedBy.lastName}`} />
            <Meta label="Gönderim" value={formatTimestamp(detail.submittedAt)} />
            <Meta label="Son güncelleme" value={formatTimestamp(detail.updatedAt)} />
            <Meta label="Revizyon" value={String(detail.revision)} />
          </View>
        </View>

        {notice ? <Notice tone="success">{notice}</Notice> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}

        {detail.canReviewLock ? (
          <View style={[uiStyles.card, styles.actionCard]}>
            <Text style={uiStyles.sectionTitle}>Yönetici incelemesi</Text>
            <Text style={uiStyles.muted}>
              İnceleme kilidi sonrası kayıt genel düzenlemeye kapanır. Düzeltme için gerekçeli talep gerekir.
            </Text>
            <PrimaryButton
              label="İnceleme kilidine al"
              loading={operation === "lock"}
              onPress={() => void lockForReview()}
              tone="secondary"
            />
          </View>
        ) : null}

        {detail.canRequestEdit ? (
          <View style={[uiStyles.card, styles.actionCard]}>
            <Text style={uiStyles.sectionTitle}>Düzenleme talebi</Text>
            <Text style={uiStyles.muted}>
              Gerekçenizi gönderin. Yönetici onaylarsa size 15 dakikalık tek kullanımlık düzenleme izni açılır.
            </Text>
            <TextInput
              accessibilityLabel="Düzenleme talebi gerekçesi"
              editable={operation === null}
              maxLength={500}
              multiline
              onChangeText={setReason}
              placeholder="Düzeltme gerekçenizi yazın"
              placeholderTextColor="#7A8781"
              style={styles.reasonInput}
              value={reason}
            />
            <PrimaryButton
              disabled={reason.trim().length < 3}
              label="Talebi gönder"
              loading={operation === "request"}
              onPress={() => void requestEdit()}
            />
          </View>
        ) : detail.ownOpenEditRequest ? (
          <EditRequestStatus request={detail.ownOpenEditRequest} />
        ) : null}

        {detail.pendingEditRequests?.length ? (
          <View style={[uiStyles.card, styles.actionCard]}>
            <Text style={uiStyles.sectionTitle}>Açık düzenleme talepleri</Text>
            {detail.pendingEditRequests.map((editRequest) => (
              <View key={editRequest.id} style={styles.requestRow}>
                <View style={styles.requestCopy}>
                  <Text style={styles.requestName}>
                    {editRequest.requestedBy.firstName} {editRequest.requestedBy.lastName}
                  </Text>
                  <Text style={uiStyles.muted}>{editRequest.reason}</Text>
                </View>
                <Pill label={editRequest.status === "APPROVED" ? "İzin açık" : "Bekliyor"} tone={editRequest.status === "APPROVED" ? "success" : "warning"} />
              </View>
            ))}
            <Notice tone="information">Talep kararları bu ilk mobil dilimde yönetici web panosundan verilir.</Notice>
          </View>
        ) : null}

        <View style={[uiStyles.card, styles.studentsCard]}>
          <View style={styles.listHeading}>
            <Text style={uiStyles.sectionTitle}>Yoklama listesi</Text>
            <Text style={uiStyles.muted}>
              {absentStudentNumbers.length} devamsız · {detail.students.length - absentStudentNumbers.length} mevcut
            </Text>
          </View>
          <View style={styles.studentList}>
            {detail.students.map((student) => {
              const isAbsent = absentNumbers.has(student.number);

              return (
                <Pressable
                  key={student.number}
                  accessibilityRole={detail.canEdit ? "checkbox" : "text"}
                  accessibilityState={detail.canEdit ? { checked: isAbsent } : undefined}
                  disabled={!detail.canEdit || operation !== null}
                  onPress={() => toggleAbsent(student.number)}
                  style={({ pressed }) => [styles.studentRow, isAbsent && styles.studentRowAbsent, pressed && detail.canEdit && styles.studentRowPressed]}
                >
                  <View style={[styles.checkbox, isAbsent && styles.checkboxChecked, !detail.canEdit && styles.checkboxReadonly]}>
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

        {detail.canEdit ? (
          <PrimaryButton
            label="Devamsızlık listesini kaydet"
            loading={operation === "save"}
            onPress={() => void save()}
          />
        ) : null}
        <PrimaryButton label="Ayrıntıyı yenile" tone="secondary" loading={isLoading} onPress={() => void loadDetail()} />
      </ScrollView>
    </AppScreen>
  );
}

function EditRequestStatus({ request }: { request: NonNullable<AttendanceDetail["ownOpenEditRequest"]> }) {
  const approved = request.status === "APPROVED";

  return (
    <View style={[uiStyles.card, styles.actionCard]}>
      <Pill label={approved ? "Düzenleme izni açık" : "Düzenleme talebi bekliyor"} tone={approved ? "success" : "warning"} />
      <Text style={uiStyles.sectionTitle}>{approved ? "Düzenleme izniniz var" : "Talebiniz yönetici incelemesinde"}</Text>
      <Text style={uiStyles.muted}>
        {approved && request.editExpiresAt
          ? `İzin ${formatTimestamp(request.editExpiresAt)} zamanına kadar geçerlidir ve ilk başarılı düzenlemede kullanılır.`
          : "Yönetici kararı uygulama içi durumunuzda görünür."}
      </Text>
      <Text style={styles.reasonLabel}>Gerekçe</Text>
      <Text style={uiStyles.muted}>{request.reason}</Text>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function describeAttendanceState(detail: AttendanceDetail): {
  label: string;
  title: string;
  detail: string;
  tone: "neutral" | "success" | "warning" | "danger" | "brand";
} {
  if (detail.isFinalized) {
    return {
      label: "Kesinleşti",
      title: "Bu yoklama artık değiştirilemez",
      detail: "Sonraki iş gününün ilk yoklaması bu geçmiş tarihi kesinleştirdi.",
      tone: "neutral",
    };
  }

  if (detail.status === "LOCKED") {
    return {
      label: "İnceleme kilitli",
      title: "Yoklama yönetici incelemesinde",
      detail: detail.canEdit
        ? "Size verilen geçici düzenleme izni şu anda aktiftir."
        : "Düzenlemek için gerekçeli bir talep açmanız ve yöneticinin onaylaması gerekir.",
      tone: "warning",
    };
  }

  return {
    label: "Gönderildi",
    title: detail.canEdit ? "Devamsızlık listesi düzenlenebilir" : "Yoklama gönderildi",
    detail: detail.canEdit
      ? "Değişiklikler yeni bir revizyon olarak kaydedilir."
      : "Bu kaydı yalnız gönderen kişi veya yönetici inceleme kilidinden önce düzenleyebilir.",
    tone: "success",
  };
}

function firstRouteValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
}

const styles = StyleSheet.create({
  header: { alignItems: "flex-start", flexDirection: "row", gap: 12, justifyContent: "space-between" },
  headerCopy: { flex: 1, gap: 5 },
  stateCard: { gap: 11 },
  stateTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  metaItem: { flexBasis: "45%", flexGrow: 1, gap: 3 },
  metaLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  metaValue: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  actionCard: { gap: 12 },
  reasonInput: { backgroundColor: "#FFFFFF", borderColor: colors.border, borderRadius: 12, borderWidth: 1, color: colors.ink, fontSize: 15, minHeight: 96, padding: 12, textAlignVertical: "top" },
  requestRow: { alignItems: "flex-start", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: 8, justifyContent: "space-between", paddingTop: 12 },
  requestCopy: { flex: 1, gap: 3 },
  requestName: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  reasonLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  studentsCard: { gap: 14 },
  listHeading: { gap: 3 },
  studentList: { borderTopColor: colors.border, borderTopWidth: 1 },
  studentRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: 10, minHeight: 56, paddingVertical: 8 },
  studentRowAbsent: { backgroundColor: "#FFF7F5" },
  studentRowPressed: { opacity: 0.7 },
  checkbox: { alignItems: "center", borderColor: colors.border, borderRadius: 6, borderWidth: 1, height: 24, justifyContent: "center", width: 24 },
  checkboxReadonly: { opacity: 0.7 },
  checkboxChecked: { backgroundColor: colors.danger, borderColor: colors.danger },
  checkboxMark: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  studentNumber: { color: colors.muted, fontSize: 13, fontWeight: "700", minWidth: 34, textAlign: "right" },
  studentName: { color: colors.ink, flex: 1, fontSize: 15, fontWeight: "600" },
  studentStatus: { color: colors.success, fontSize: 12, fontWeight: "700" },
  studentStatusAbsent: { color: colors.danger },
  centeredContent: { flex: 1, justifyContent: "center", padding: 20 },
});
