import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { NavLink, useOutletContext } from "react-router";
import { ApiError } from "../../lib/api";
import type { SchoolShellContext } from "../app/app-shell";
import { useAuth } from "../auth/auth-context";
import {
  approveAttendanceEditRequest,
  createAttendance,
  createAttendanceEditRequest,
  getAttendanceBoard,
  getAttendanceDetail,
  getAttendanceEditRequests,
  getAttendanceEntryContext,
  rejectAttendanceEditRequest,
  reviewLockAttendance,
  type AttendanceBoard,
  type AttendanceDetail,
  type AttendanceEditRequest,
  type AttendanceSummary,
  type DayOfWeek,
  updateAttendance,
} from "./attendance-api";

interface EntryTarget {
  classId: string;
  className: string;
  lessonNumber: number;
}

interface BoardClass {
  id: string;
  name: string;
  isCurrent: boolean;
}

interface BoardPeriod {
  lessonNumber: number;
  startMinute: number | null;
  endMinute: number | null;
  isCurrent: boolean;
}

export function AttendancePage() {
  const { school } = useOutletContext<SchoolShellContext>();
  const { request } = useAuth();
  const queryClient = useQueryClient();
  const schoolId = school.school.id;
  const [selectedDate, setSelectedDate] = useState(istanbulToday());
  const [entryTarget, setEntryTarget] = useState<EntryTarget | null>(null);
  const [detailAttendanceId, setDetailAttendanceId] = useState<string | null>(
    null,
  );
  const today = istanbulToday();
  const isFutureDate = selectedDate > today;

  const boardQuery = useQuery({
    queryKey: ["attendance-board", schoolId, selectedDate],
    queryFn: () => getAttendanceBoard(request, schoolId, selectedDate),
    retry: false,
  });

  async function invalidateAttendance() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["attendance-board", schoolId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["attendance-detail", schoolId],
      }),
    ]);
  }

  return (
    <main className="management-page attendance-page">
      <header className="management-heading attendance-heading">
        <div>
          <p className="eyebrow">GÜNLÜK TAKİP</p>
          <h1>Yoklamalar</h1>
          <p>
            Her sınıf ve ders saati için tek, kalıcı yoklama kaydını takip
            edin. Günlük kesinleşen kayıtlar yeniden açılamaz.
          </p>
        </div>
        <DateControls
          date={selectedDate}
          today={today}
          onChange={setSelectedDate}
        />
      </header>

      <section className="timezone-note attendance-timezone-note" aria-label="Yoklama tarihi bilgisi">
        <span aria-hidden="true">◷</span>
        <div>
          <strong>{formatLongDate(selectedDate)}</strong>
          <p>
            İş tarihi ve ders saatleri Türkiye / İstanbul zamanına göre
            değerlendirilir. {isFutureDate ? "Gelecek tarihli yoklama gönderilemez." : ""}
          </p>
        </div>
      </section>

      {boardQuery.isPending ? (
        <AttendanceLoading />
      ) : boardQuery.isError || !boardQuery.data ? (
        <AttendanceQueryError
          error={boardQuery.error}
          onRetry={() => void boardQuery.refetch()}
        />
      ) : (
        <AttendanceBoardView
          board={boardQuery.data}
          isFutureDate={isFutureDate}
          schoolId={schoolId}
          onOpenEntry={(target) => setEntryTarget(target)}
          onOpenDetail={(attendanceId) => setDetailAttendanceId(attendanceId)}
        />
      )}

      {entryTarget ? (
        <AttendanceEntryDialog
          key={`${entryTarget.classId}-${selectedDate}-${entryTarget.lessonNumber}`}
          schoolId={schoolId}
          target={entryTarget}
          date={selectedDate}
          onClose={() => setEntryTarget(null)}
          onExisting={(attendanceId) => {
            setEntryTarget(null);
            setDetailAttendanceId(attendanceId);
          }}
          onSubmitted={async (attendanceId) => {
            setEntryTarget(null);
            await invalidateAttendance();
            setDetailAttendanceId(attendanceId);
          }}
        />
      ) : null}

      {detailAttendanceId ? (
        <AttendanceDetailDialog
          key={detailAttendanceId}
          schoolId={schoolId}
          attendanceId={detailAttendanceId}
          onClose={() => setDetailAttendanceId(null)}
          onChanged={invalidateAttendance}
        />
      ) : null}
    </main>
  );
}

function DateControls({
  date,
  today,
  onChange,
}: {
  date: string;
  today: string;
  onChange: (date: string) => void;
}) {
  return (
    <div className="attendance-date-controls" aria-label="Yoklama tarihi">
      <button
        className="icon-button"
        type="button"
        aria-label="Önceki gün"
        onClick={() => onChange(shiftBusinessDate(date, -1))}
      >
        ‹
      </button>
      <label className="attendance-date-field">
        <span className="visually-hidden">Yoklama tarihi</span>
        <input
          type="date"
          value={date}
          onChange={(event) => {
            if (event.target.value) {
              onChange(event.target.value);
            }
          }}
        />
      </label>
      <button
        className="icon-button"
        type="button"
        aria-label="Sonraki gün"
        onClick={() => onChange(shiftBusinessDate(date, 1))}
      >
        ›
      </button>
      <button
        className="secondary-action attendance-today-button"
        type="button"
        onClick={() => onChange(today)}
        disabled={date === today}
      >
        Bugün
      </button>
    </div>
  );
}

function AttendanceBoardView({
  board,
  isFutureDate,
  schoolId,
  onOpenEntry,
  onOpenDetail,
}: {
  board: AttendanceBoard;
  isFutureDate: boolean;
  schoolId: string;
  onOpenEntry: (target: EntryTarget) => void;
  onOpenDetail: (attendanceId: string) => void;
}) {
  const classes = displayClasses(board);
  const periods = displayPeriods(board);
  const hasCurrentClasses = board.classes.length > 0;
  const hasCurrentPeriods = board.lessonPeriods.length > 0;

  return (
    <>
      {!hasCurrentClasses ? (
        <section className="setup-warning" aria-label="Sınıf kurulumu gerekli">
          <div>
            <p className="eyebrow">ÖN KOŞUL</p>
            <h2>Yoklama için önce aktif sınıf ekleyin.</h2>
            <p>Arşivlenmiş sınıfların eski yoklamaları gösterilmeye devam eder.</p>
          </div>
          <NavLink className="secondary-action" to={`/schools/${schoolId}/classes`}>
            Sınıflara git
          </NavLink>
        </section>
      ) : null}
      {!hasCurrentPeriods ? (
        <section className="setup-warning" aria-label="Ders saati kurulumu gerekli">
          <div>
            <p className="eyebrow">ÖN KOŞUL</p>
            <h2>Bu gün için ders saati tanımlı değil.</h2>
            <p>Yeni yoklama göndermek için seçili günün ders saatini ekleyin.</p>
          </div>
          <NavLink
            className="secondary-action"
            to={`/schools/${schoolId}/lesson-periods`}
          >
            Ders saatlerine git
          </NavLink>
        </section>
      ) : null}

      {board.isFinalized ? (
        <section className="attendance-finalized-note" aria-label="Günlük kesinleşme bilgisi">
          <strong>Bu gün kesinleşti.</strong>
          <span>
            Eksik kalan slotlar yoklama alınmamış olarak saklanır; yönetici dâhil
            hiç kimse yeni kayıt veya düzeltme yapamaz.
          </span>
        </section>
      ) : null}

      <section className="management-card attendance-board-card" aria-labelledby="attendance-board-title">
        <div className="list-toolbar attendance-board-toolbar">
          <div>
            <h2 id="attendance-board-title">{dayLabel(board.dayOfWeek)} yoklama panosu</h2>
            <p>
              Hücredeki bir kayıt, o sınıfın ilgili ders saati için tekil
              yoklamasıdır. Boş bir slot yalnız uygun günlerde gönderilebilir.
            </p>
          </div>
          <div className="attendance-board-summary">
            <strong>{board.attendances.length}</strong>
            <span>gönderilmiş yoklama</span>
          </div>
        </div>

        {classes.length === 0 || periods.length === 0 ? (
          <div className="class-empty-state attendance-empty-state">
            <div className="empty-symbol" aria-hidden="true">
              ◷
            </div>
            <h3>Gösterilecek yoklama slotu yok.</h3>
            <p>
              Seçili gün için aktif sınıf ve ders saati tanımladığınızda günlük
              pano burada oluşur.
            </p>
          </div>
        ) : (
          <div className="attendance-board-wrap">
            <table className="attendance-board-table">
              <thead>
                <tr>
                  <th scope="col">Ders</th>
                  {classes.map((classroom) => (
                    <th key={classroom.id} scope="col">
                      <span>{classroom.name}</span>
                      {!classroom.isCurrent ? <small>geçmiş sınıf</small> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => (
                  <tr key={period.lessonNumber}>
                    <th scope="row">
                      <strong>{period.lessonNumber}. ders</strong>
                      <span>{formatTimeRange(period.startMinute, period.endMinute)}</span>
                      {!period.isCurrent ? <small>eski saat snapshot'ı</small> : null}
                    </th>
                    {classes.map((classroom) => (
                      <td key={classroom.id}>
                        <AttendanceSlot
                          attendance={findAttendance(
                            board.attendances,
                            classroom.id,
                            period.lessonNumber,
                          )}
                          classroom={classroom}
                          period={period}
                          boardFinalized={board.isFinalized}
                          isFutureDate={isFutureDate}
                          onOpenEntry={onOpenEntry}
                          onOpenDetail={onOpenDetail}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function AttendanceSlot({
  attendance,
  classroom,
  period,
  boardFinalized,
  isFutureDate,
  onOpenEntry,
  onOpenDetail,
}: {
  attendance: AttendanceSummary | undefined;
  classroom: BoardClass;
  period: BoardPeriod;
  boardFinalized: boolean;
  isFutureDate: boolean;
  onOpenEntry: (target: EntryTarget) => void;
  onOpenDetail: (attendanceId: string) => void;
}) {
  if (attendance) {
    const state = attendance.isFinalized
      ? "Kesinleşti"
      : attendance.status === "LOCKED"
        ? "İnceleme kilitli"
        : "Düzeltmeye açık";

    return (
      <button
        className={`attendance-slot submitted ${attendance.isFinalized ? "finalized" : ""} ${
          attendance.status === "LOCKED" ? "review-locked" : ""
        }`}
        type="button"
        onClick={() => onOpenDetail(attendance.id)}
      >
        <strong>
          {attendance.absentCount === 0
            ? "Herkes mevcut"
            : `${attendance.absentCount} devamsız`}
        </strong>
        <span>{state}</span>
        <small>
          R{attendance.revision}
          {attendance.hasOpenEditRequest ? " · Talep bekliyor" : ""}
        </small>
      </button>
    );
  }

  if (boardFinalized) {
    return (
      <div className="attendance-slot unavailable finalized-empty">
        <strong>Alınmamış</strong>
        <span>Gün kesinleşti</span>
      </div>
    );
  }

  if (isFutureDate) {
    return (
      <div className="attendance-slot unavailable">
        <strong>Gelecek gün</strong>
        <span>Yoklama gönderilemez</span>
      </div>
    );
  }

  if (!classroom.isCurrent) {
    return (
      <div className="attendance-slot unavailable">
        <strong>Arşivli sınıf</strong>
        <span>Yeni yoklama yok</span>
      </div>
    );
  }

  if (!period.isCurrent) {
    return (
      <div className="attendance-slot unavailable">
        <strong>Ders saati yok</strong>
        <span>Önce saat tanımlayın</span>
      </div>
    );
  }

  return (
    <button
      className="attendance-slot empty"
      type="button"
      onClick={() =>
        onOpenEntry({
          classId: classroom.id,
          className: classroom.name,
          lessonNumber: period.lessonNumber,
        })
      }
    >
      <strong>Yoklama al</strong>
      <span>Devamsızları işaretleyin</span>
    </button>
  );
}

function AttendanceEntryDialog({
  schoolId,
  target,
  date,
  onClose,
  onExisting,
  onSubmitted,
}: {
  schoolId: string;
  target: EntryTarget;
  date: string;
  onClose: () => void;
  onExisting: (attendanceId: string) => void;
  onSubmitted: (attendanceId: string) => Promise<void>;
}) {
  const { request } = useAuth();
  const [absentNumbers, setAbsentNumbers] = useState<number[]>([]);
  const contextQuery = useQuery({
    queryKey: [
      "attendance-entry-context",
      schoolId,
      target.classId,
      date,
      target.lessonNumber,
    ],
    queryFn: () =>
      getAttendanceEntryContext(request, schoolId, {
        classId: target.classId,
        lessonDate: date,
        lessonNumber: target.lessonNumber,
      }),
    retry: false,
  });
  const createMutation = useMutation({
    mutationFn: () =>
      createAttendance(request, schoolId, {
        classId: target.classId,
        lessonDate: date,
        lessonNumber: target.lessonNumber,
        absentStudentNumbers: absentNumbers,
      }),
    retry: false,
    onSuccess: async (attendance) => {
      await onSubmitted(attendance.id);
    },
  });

  function toggleAbsent(number: number) {
    setAbsentNumbers((current) =>
      current.includes(number)
        ? current.filter((value) => value !== number)
        : [...current, number].sort((left, right) => left - right),
    );
  }

  return (
    <div className="dialog-backdrop">
      <section
        className="dialog-card attendance-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-entry-title"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">YENİ YOKLAMA</p>
            <h2 id="attendance-entry-title">{target.className} · {target.lessonNumber}. ders</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Pencereyi kapat"
            onClick={onClose}
            disabled={createMutation.isPending}
          >
            ×
          </button>
        </div>

        {contextQuery.isPending ? (
          <div className="dialog-loading" aria-live="polite">Sınıf mevcudu yükleniyor…</div>
        ) : contextQuery.isError || !contextQuery.data ? (
          <div className="dialog-copy-block">
            <p className="dialog-error">{errorMessage(contextQuery.error)}</p>
            <button
              className="secondary-action"
              type="button"
              onClick={() => void contextQuery.refetch()}
            >
              Tekrar dene
            </button>
          </div>
        ) : contextQuery.data.existingAttendanceId ? (
          <div className="dialog-copy-block">
            <p className="dialog-copy">
              Bu sınıfın seçilen tarih ve ders saati için yoklaması başka biri
              tarafından zaten gönderilmiş.
            </p>
            <div className="dialog-actions">
              <button className="secondary-action" type="button" onClick={onClose}>
                Vazgeç
              </button>
              <button
                className="primary-action"
                type="button"
                onClick={() => onExisting(contextQuery.data!.existingAttendanceId!)}
              >
                Mevcut yoklamayı aç
              </button>
            </div>
          </div>
        ) : (
          <form
            className="dialog-form attendance-entry-form"
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate();
            }}
          >
            <div className="attendance-entry-summary">
              <strong>{formatLongDate(date)}</strong>
              <span>
                {formatTimeRange(
                  contextQuery.data.lessonPeriod.startMinute,
                  contextQuery.data.lessonPeriod.endMinute,
                )}
              </span>
            </div>
            <p className="dialog-copy">
              İşaretledikleriniz devamsız olarak kaydedilir. Hiç kimseyi
              işaretlemezseniz herkes mevcut kabul edilir.
            </p>
            <div className="attendance-entry-count" aria-live="polite">
              <strong>{absentNumbers.length}</strong>
              <span>devamsız · {contextQuery.data.students.length - absentNumbers.length} mevcut</span>
              {absentNumbers.length > 0 ? (
                <button
                  className="quiet-action"
                  type="button"
                  onClick={() => setAbsentNumbers([])}
                  disabled={createMutation.isPending}
                >
                  Tümünü temizle
                </button>
              ) : null}
            </div>
            <div className="attendance-roster" role="group" aria-label="Öğrenci mevcudu">
              {contextQuery.data.students.map((student) => {
                const isAbsent = absentNumbers.includes(student.number);

                return (
                  <label
                    key={student.number}
                    className={`attendance-roster-row ${isAbsent ? "absent" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isAbsent}
                      onChange={() => toggleAbsent(student.number)}
                      disabled={createMutation.isPending}
                    />
                    <span className="student-number">{student.number}</span>
                    <strong>{student.firstName} {student.lastName}</strong>
                    <small>{isAbsent ? "Devamsız" : "Mevcut"}</small>
                  </label>
                );
              })}
            </div>
            {createMutation.error ? (
              <p className="dialog-error">{errorMessage(createMutation.error)}</p>
            ) : null}
            <div className="dialog-actions">
              <button
                className="secondary-action"
                type="button"
                onClick={onClose}
                disabled={createMutation.isPending}
              >
                Vazgeç
              </button>
              <button className="primary-action" type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Gönderiliyor…" : "Yoklamayı gönder"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function AttendanceDetailDialog({
  schoolId,
  attendanceId,
  onClose,
  onChanged,
}: {
  schoolId: string;
  attendanceId: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { request } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [absentNumbers, setAbsentNumbers] = useState<number[]>([]);
  const [isRequestingEdit, setIsRequestingEdit] = useState(false);
  const [requestReason, setRequestReason] = useState("");
  const detailQuery = useQuery({
    queryKey: ["attendance-detail", schoolId, attendanceId],
    queryFn: () => getAttendanceDetail(request, schoolId, attendanceId),
    retry: false,
  });
  const editRequestsQuery = useQuery({
    queryKey: ["attendance-edit-requests", schoolId, attendanceId],
    queryFn: () => getAttendanceEditRequests(request, schoolId, attendanceId),
    enabled: Boolean(detailQuery.data?.pendingEditRequests),
    retry: false,
  });

  async function refreshAfterChange() {
    await Promise.all([
      onChanged(),
      detailQuery.refetch(),
      editRequestsQuery.refetch(),
    ]);
  }

  const updateMutation = useMutation({
    mutationFn: () => {
      const detail = detailQuery.data!;
      return updateAttendance(request, schoolId, attendanceId, {
        expectedRevision: detail.revision,
        absentStudentNumbers: absentNumbers,
      });
    },
    retry: false,
    onSuccess: async () => {
      setIsEditing(false);
      await refreshAfterChange();
    },
  });
  const reviewLockMutation = useMutation({
    mutationFn: () => reviewLockAttendance(request, schoolId, attendanceId),
    retry: false,
    onSuccess: refreshAfterChange,
  });
  const requestEditMutation = useMutation({
    mutationFn: () =>
      createAttendanceEditRequest(request, schoolId, attendanceId, requestReason),
    retry: false,
    onSuccess: async () => {
      setRequestReason("");
      setIsRequestingEdit(false);
      await refreshAfterChange();
    },
  });
  const reviewRequestMutation = useMutation({
    mutationFn: ({
      requestId,
      decision,
      note,
    }: {
      requestId: string;
      decision: "approve" | "reject";
      note?: string;
    }) =>
      decision === "approve"
        ? approveAttendanceEditRequest(
            request,
            schoolId,
            attendanceId,
            requestId,
            note,
          )
        : rejectAttendanceEditRequest(
            request,
            schoolId,
            attendanceId,
            requestId,
            note,
          ),
    retry: false,
    onSuccess: refreshAfterChange,
  });
  const mutationError =
    updateMutation.error ??
    reviewLockMutation.error ??
    requestEditMutation.error ??
    reviewRequestMutation.error;
  const isMutating =
    updateMutation.isPending ||
    reviewLockMutation.isPending ||
    requestEditMutation.isPending ||
    reviewRequestMutation.isPending;

  function beginEditing(detail: AttendanceDetail) {
    setAbsentNumbers(detail.absentStudentNumbers);
    setIsRequestingEdit(false);
    setIsEditing(true);
  }

  function toggleAbsent(number: number) {
    setAbsentNumbers((current) =>
      current.includes(number)
        ? current.filter((value) => value !== number)
        : [...current, number].sort((left, right) => left - right),
    );
  }

  if (detailQuery.isPending) {
    return <DialogLoading onClose={onClose} />;
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <DialogError
        error={detailQuery.error}
        onClose={onClose}
        onRetry={() => void detailQuery.refetch()}
      />
    );
  }

  const detail = detailQuery.data;
  const pendingRequests = (
    editRequestsQuery.data ?? detail.pendingEditRequests ?? []
  ).filter((editRequest) => editRequest.status === "PENDING");

  return (
    <div className="dialog-backdrop">
      <section
        className="dialog-card attendance-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-detail-title"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">YOKLAMA DETAYI</p>
            <h2 id="attendance-detail-title">{detail.className} · {detail.lessonNumber}. ders</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Pencereyi kapat"
            onClick={onClose}
            disabled={isMutating}
          >
            ×
          </button>
        </div>

        <div className="attendance-detail-summary">
          <span>{formatLongDate(detail.lessonDate)}</span>
          <span>{formatTimeRange(detail.lessonStartMinute, detail.lessonEndMinute)}</span>
          <span>R{detail.revision}</span>
          <AttendanceStatusBadge detail={detail} />
        </div>

        <div className="attendance-detail-people">
          <span>Gönderen: <strong>{detail.submittedBy.firstName} {detail.submittedBy.lastName}</strong></span>
          <span>Son güncelleme: <strong>{formatDateTime(detail.updatedAt)}</strong></span>
        </div>

        {detail.isFinalized ? (
          <p className="attendance-detail-notice finalized">
            Bu yoklama günlük kesinleşme nedeniyle kalıcı olarak kapalıdır.
          </p>
        ) : detail.status === "LOCKED" ? (
          <p className="attendance-detail-notice locked">
            İnceleme kilidi etkin. Düzeltme yalnız yönetici onaylı, tek kullanımlık
            izinle yapılabilir.
          </p>
        ) : (
          <p className="attendance-detail-notice open">
            İnceleme kilidi henüz yok. Gönderen veya yönetici devamsız listesini
            güncelleyebilir.
          </p>
        )}

        {detail.editPermissionExpiresAt ? (
          <p className="attendance-detail-notice grant">
            Size verilen tek kullanımlık düzenleme izni {formatDateTime(detail.editPermissionExpiresAt)}
            tarihinde sona erer.
          </p>
        ) : null}

        <section className="attendance-snapshot" aria-labelledby="attendance-snapshot-title">
          <div className="attendance-snapshot-heading">
            <div>
              <h3 id="attendance-snapshot-title">Gönderim anındaki sınıf mevcudu</h3>
              <p>Ad, numara ve sınıf değişse bile bu kayıt snapshot olarak korunur.</p>
            </div>
            <strong>{isEditing ? absentNumbers.length : detail.absentCount} devamsız</strong>
          </div>
          <div className="attendance-snapshot-list">
            {detail.students.map((student) => {
              const isAbsent = isEditing
                ? absentNumbers.includes(student.number)
                : student.status === "ABSENT";

              return isEditing ? (
                <label
                  key={student.number}
                  className={`attendance-snapshot-row editable ${isAbsent ? "absent" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={isAbsent}
                    onChange={() => toggleAbsent(student.number)}
                    disabled={updateMutation.isPending}
                  />
                  <span className="student-number">{student.number}</span>
                  <strong>{student.firstName} {student.lastName}</strong>
                  <small>{isAbsent ? "Devamsız" : "Mevcut"}</small>
                </label>
              ) : (
                <div
                  key={student.number}
                  className={`attendance-snapshot-row ${isAbsent ? "absent" : ""}`}
                >
                  <span className="student-number">{student.number}</span>
                  <strong>{student.firstName} {student.lastName}</strong>
                  <small>{isAbsent ? "Devamsız" : "Mevcut"}</small>
                </div>
              );
            })}
          </div>
        </section>

        {mutationError ? <p className="dialog-error">{errorMessage(mutationError)}</p> : null}

        {isEditing ? (
          <div className="dialog-actions">
            <button
              className="secondary-action"
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={updateMutation.isPending}
            >
              Vazgeç
            </button>
            <button
              className="primary-action"
              type="button"
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Kaydediliyor…" : "Devamsızları güncelle"}
            </button>
          </div>
        ) : (
          <div className="attendance-detail-actions">
            {detail.canEdit ? (
              <button
                className="primary-action"
                type="button"
                onClick={() => beginEditing(detail)}
                disabled={isMutating}
              >
                Devamsızları düzenle
              </button>
            ) : null}
            {detail.canReviewLock ? (
              <button
                className="secondary-action"
                type="button"
                onClick={() => reviewLockMutation.mutate()}
                disabled={isMutating}
              >
                {reviewLockMutation.isPending ? "Kilitleniyor…" : "İnceleme kilidine al"}
              </button>
            ) : null}
            {detail.canRequestEdit && !isRequestingEdit ? (
              <button
                className="secondary-action"
                type="button"
                onClick={() => setIsRequestingEdit(true)}
                disabled={isMutating}
              >
                Düzeltme talep et
              </button>
            ) : null}
          </div>
        )}

        {isRequestingEdit ? (
          <form
            className="attendance-request-form"
            onSubmit={(event) => {
              event.preventDefault();
              requestEditMutation.mutate();
            }}
          >
            <label htmlFor="attendance-request-reason">Düzeltme gerekçesi</label>
            <textarea
              id="attendance-request-reason"
              value={requestReason}
              minLength={3}
              maxLength={500}
              placeholder="Örn. Devamsız öğrenci numarası eksik işaretlendi."
              onChange={(event) => setRequestReason(event.target.value)}
              disabled={requestEditMutation.isPending}
            />
            <p>Yönetici onaylarsa yalnız talep sahibine 15 dakikalık, tek kullanımlık düzenleme izni verilir.</p>
            <div className="dialog-actions">
              <button
                className="secondary-action"
                type="button"
                onClick={() => setIsRequestingEdit(false)}
                disabled={requestEditMutation.isPending}
              >
                Vazgeç
              </button>
              <button
                className="primary-action"
                type="submit"
                disabled={requestEditMutation.isPending || requestReason.trim().length < 3}
              >
                {requestEditMutation.isPending ? "Gönderiliyor…" : "Talebi gönder"}
              </button>
            </div>
          </form>
        ) : null}

        {detail.ownOpenEditRequest ? (
          <section className="attendance-own-request">
            <strong>{editRequestLabel(detail.ownOpenEditRequest.status)}</strong>
            <span>{detail.ownOpenEditRequest.reason}</span>
          </section>
        ) : null}

        <section className="attendance-request-queue" aria-labelledby="attendance-request-queue-title">
          <div>
            <h3 id="attendance-request-queue-title">Bekleyen düzeltme talepleri</h3>
            <p>V1'de ayrı push bildirimi yerine talepler bu yönetici kuyruğunda görünür.</p>
          </div>
          {editRequestsQuery.isPending ? (
            <p className="request-queue-loading">Talepler yükleniyor…</p>
          ) : pendingRequests.length === 0 ? (
            <p className="request-queue-empty">Bekleyen talep yok.</p>
          ) : (
            <div className="attendance-request-list">
              {pendingRequests.map((editRequest) => (
                <EditRequestCard
                  key={editRequest.id}
                  editRequest={editRequest}
                  isSubmitting={reviewRequestMutation.isPending}
                  onDecide={(decision, note) =>
                    reviewRequestMutation.mutate({
                      requestId: editRequest.id,
                      decision,
                      note,
                    })
                  }
                />
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

function EditRequestCard({
  editRequest,
  isSubmitting,
  onDecide,
}: {
  editRequest: AttendanceEditRequest;
  isSubmitting: boolean;
  onDecide: (decision: "approve" | "reject", note?: string) => void;
}) {
  const [note, setNote] = useState("");

  return (
    <article className="attendance-request-card">
      <div className="attendance-request-card-heading">
        <div>
          <strong>{editRequest.requestedBy.firstName} {editRequest.requestedBy.lastName}</strong>
          <span>{roleLabel(editRequest.requestedBy.role)} · {formatDateTime(editRequest.requestedAt)}</span>
        </div>
        <span className="attendance-status-badge pending">Bekliyor</span>
      </div>
      <p>{editRequest.reason}</p>
      <label>
        <span className="visually-hidden">Yönetici notu</span>
        <input
          value={note}
          maxLength={500}
          placeholder="Yönetici notu (isteğe bağlı)"
          onChange={(event) => setNote(event.target.value)}
          disabled={isSubmitting}
        />
      </label>
      <div className="attendance-request-card-actions">
        <button
          className="quiet-action danger-action"
          type="button"
          onClick={() => onDecide("reject", note)}
          disabled={isSubmitting}
        >
          Reddet
        </button>
        <button
          className="primary-action"
          type="button"
          onClick={() => onDecide("approve", note)}
          disabled={isSubmitting}
        >
          Onayla · 15 dk izin
        </button>
      </div>
    </article>
  );
}

function AttendanceStatusBadge({ detail }: { detail: AttendanceDetail }) {
  if (detail.isFinalized) {
    return <span className="attendance-status-badge finalized">Kesinleşti</span>;
  }

  if (detail.status === "LOCKED") {
    return <span className="attendance-status-badge locked">İnceleme kilitli</span>;
  }

  return <span className="attendance-status-badge open">Düzeltmeye açık</span>;
}

function DialogLoading({ onClose }: { onClose: () => void }) {
  return (
    <div className="dialog-backdrop">
      <section className="dialog-card attendance-dialog-state" role="dialog" aria-modal="true">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">YOKLAMA DETAYI</p>
            <h2>Yükleniyor…</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Pencereyi kapat" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="dialog-loading" aria-live="polite">Yoklama snapshot'ı yükleniyor…</div>
      </section>
    </div>
  );
}

function DialogError({
  error,
  onClose,
  onRetry,
}: {
  error: unknown;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="dialog-backdrop">
      <section className="dialog-card attendance-dialog-state" role="dialog" aria-modal="true">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">YOKLAMA DETAYI</p>
            <h2>Kayıt yüklenemedi</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Pencereyi kapat" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="dialog-error">{errorMessage(error)}</p>
        <div className="dialog-actions">
          <button className="secondary-action" type="button" onClick={onClose}>Kapat</button>
          <button className="primary-action" type="button" onClick={onRetry}>Tekrar dene</button>
        </div>
      </section>
    </div>
  );
}

function AttendanceLoading() {
  return (
    <section className="management-card attendance-board-state" aria-live="polite">
      <div className="class-loading">
        <span />
        <span />
        <span />
        <p>Yoklama panosu yükleniyor…</p>
      </div>
    </section>
  );
}

function AttendanceQueryError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <section className="management-card attendance-board-state">
      <div className="class-empty-state error-state">
        <div className="empty-symbol" aria-hidden="true">!</div>
        <h3>Yoklama panosu yüklenemedi.</h3>
        <p>{errorMessage(error)}</p>
        <button className="secondary-action" type="button" onClick={onRetry}>
          Tekrar dene
        </button>
      </div>
    </section>
  );
}

function displayClasses(board: AttendanceBoard): BoardClass[] {
  const currentClassIds = new Set(board.classes.map((classroom) => classroom.id));
  const classes = new Map<string, BoardClass>();

  for (const classroom of board.classes) {
    classes.set(classroom.id, { ...classroom, isCurrent: true });
  }
  for (const attendance of board.attendances) {
    if (!classes.has(attendance.classId)) {
      classes.set(attendance.classId, {
        id: attendance.classId,
        name: attendance.className,
        isCurrent: currentClassIds.has(attendance.classId),
      });
    }
  }

  return [...classes.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "tr"),
  );
}

function displayPeriods(board: AttendanceBoard): BoardPeriod[] {
  const periods = new Map<number, BoardPeriod>();

  for (const period of board.lessonPeriods) {
    periods.set(period.lessonNumber, {
      lessonNumber: period.lessonNumber,
      startMinute: period.startMinute,
      endMinute: period.endMinute,
      isCurrent: true,
    });
  }
  for (const attendance of board.attendances) {
    if (!periods.has(attendance.lessonNumber)) {
      periods.set(attendance.lessonNumber, {
        lessonNumber: attendance.lessonNumber,
        startMinute: attendance.lessonStartMinute,
        endMinute: attendance.lessonEndMinute,
        isCurrent: false,
      });
    }
  }

  return [...periods.values()].sort(
    (left, right) => left.lessonNumber - right.lessonNumber,
  );
}

function findAttendance(
  attendances: AttendanceSummary[],
  classId: string,
  lessonNumber: number,
) {
  return attendances.find(
    (attendance) =>
      attendance.classId === classId && attendance.lessonNumber === lessonNumber,
  );
}

function istanbulToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<"year" | "month" | "day", string>;

  return `${values.year}-${values.month}-${values.day}`;
}

function shiftBusinessDate(value: string, offset: number) {
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + offset));

  return [
    String(next.getUTCFullYear()).padStart(4, "0"),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function formatLongDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  return new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function formatTimeRange(startMinute: number | null, endMinute: number | null) {
  if (startMinute === null || endMinute === null) {
    return "Saat snapshot'ı yok";
  }

  return `${formatMinute(startMinute)}–${formatMinute(endMinute)}`;
}

function formatMinute(value: number) {
  if (value === 1440) {
    return "24:00";
  }

  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(
    value % 60,
  ).padStart(2, "0")}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  }).format(new Date(value));
}

function dayLabel(day: DayOfWeek) {
  return {
    MONDAY: "Pazartesi",
    TUESDAY: "Salı",
    WEDNESDAY: "Çarşamba",
    THURSDAY: "Perşembe",
    FRIDAY: "Cuma",
    SATURDAY: "Cumartesi",
    SUNDAY: "Pazar",
  }[day];
}

function roleLabel(role: "ADMIN" | "TEACHER") {
  return role === "ADMIN" ? "Yönetici" : "Öğretmen";
}

function editRequestLabel(status: AttendanceEditRequest["status"]) {
  return status === "APPROVED" ? "Düzenleme izni verildi" : "Düzeltme talebiniz bekliyor";
}

function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
}
