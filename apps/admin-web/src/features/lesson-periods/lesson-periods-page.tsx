import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useOutletContext } from "react-router";
import { ApiError } from "../../lib/api";
import type { SchoolShellContext } from "../app/app-shell";
import { useAuth } from "../auth/auth-context";
import {
  createLessonPeriod,
  deleteLessonPeriod,
  getLessonPeriods,
  type DayOfWeek,
  type LessonPeriodInput,
  type LessonPeriodSummary,
  updateLessonPeriod,
} from "./lesson-periods-api";

const WEEK_DAYS: Array<{ value: DayOfWeek; label: string; shortLabel: string }> = [
  { value: "MONDAY", label: "Pazartesi", shortLabel: "Pzt" },
  { value: "TUESDAY", label: "Salı", shortLabel: "Sal" },
  { value: "WEDNESDAY", label: "Çarşamba", shortLabel: "Çar" },
  { value: "THURSDAY", label: "Perşembe", shortLabel: "Per" },
  { value: "FRIDAY", label: "Cuma", shortLabel: "Cum" },
  { value: "SATURDAY", label: "Cumartesi", shortLabel: "Cmt" },
  { value: "SUNDAY", label: "Pazar", shortLabel: "Paz" },
];

interface PeriodFormState {
  mode: "create" | "edit";
  period?: LessonPeriodSummary;
}

export function LessonPeriodsPage() {
  const { school } = useOutletContext<SchoolShellContext>();
  const { request } = useAuth();
  const queryClient = useQueryClient();
  const schoolId = school.school.id;
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>("MONDAY");
  const [form, setForm] = useState<PeriodFormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LessonPeriodSummary | null>(
    null,
  );

  const periodsQuery = useQuery({
    queryKey: ["lesson-periods", schoolId],
    queryFn: () => getLessonPeriods(request, schoolId),
    retry: false,
  });
  const periods = periodsQuery.data ?? [];
  const selectedPeriods = periods.filter(
    (period) => period.dayOfWeek === selectedDay,
  );
  const nextLessonNumber = Math.max(
    0,
    ...selectedPeriods.map((period) => period.lessonNumber),
  ) + 1;

  const invalidatePeriods = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["lesson-periods", schoolId],
    });
  };
  const createMutation = useMutation({
    mutationFn: (input: LessonPeriodInput) =>
      createLessonPeriod(request, schoolId, input),
    retry: false,
    onSuccess: async () => {
      setForm(null);
      await invalidatePeriods();
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({
      lessonPeriodId,
      input,
    }: {
      lessonPeriodId: string;
      input: LessonPeriodInput;
    }) => updateLessonPeriod(request, schoolId, lessonPeriodId, input),
    retry: false,
    onSuccess: async () => {
      setForm(null);
      await invalidatePeriods();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (lessonPeriodId: string) =>
      deleteLessonPeriod(request, schoolId, lessonPeriodId),
    retry: false,
    onSuccess: async () => {
      setDeleteTarget(null);
      await invalidatePeriods();
    },
  });

  const mutationError =
    createMutation.error ?? updateMutation.error ?? deleteMutation.error;
  const isMutating =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  function resetMutationErrors() {
    createMutation.reset();
    updateMutation.reset();
    deleteMutation.reset();
  }

  function openForm(nextForm: PeriodFormState) {
    resetMutationErrors();
    setForm(nextForm);
  }

  function closeDialog(close: () => void) {
    if (!isMutating) {
      close();
      resetMutationErrors();
    }
  }

  return (
    <main className="management-page lesson-periods-page">
      <header className="management-heading">
        <div>
          <p className="eyebrow">YAPILANDIRMA</p>
          <h1>Ders Saatleri</h1>
          <p>
            Yoklama, seçilen günün ders numarası ve saat aralığına göre
            doğrulanır.
          </p>
        </div>
        <button
          className="primary-action"
          type="button"
          onClick={() => openForm({ mode: "create" })}
        >
          <span aria-hidden="true">+</span> Ders Saati Ekle
        </button>
      </header>

      <section className="timezone-note" aria-label="Saat dilimi bilgisi">
        <span aria-hidden="true">◷</span>
        <div>
          <strong>Türkiye / İstanbul saatleri</strong>
          <p>
            Tüm saatler İstanbul yerel saatidir. Gün ve ders sayısı okulun
            ihtiyaçlarına göre farklı olabilir.
          </p>
        </div>
      </section>

      <section className="management-card" aria-labelledby="lesson-period-list-title">
        <div className="list-toolbar lesson-period-toolbar">
          <div>
            <h2 id="lesson-period-list-title">Haftalık Ders Çizelgesi</h2>
            <p>
              Çakışan saat aralıkları kaydedilemez. Bitişi diğer dersin
              başlangıcına denk gelen saatler kullanılabilir.
            </p>
          </div>
        </div>

        <div className="week-tabs" role="tablist" aria-label="Haftanın günleri">
          {WEEK_DAYS.map((day) => {
            const count = periods.filter(
              (period) => period.dayOfWeek === day.value,
            ).length;

            return (
              <button
                key={day.value}
                className={selectedDay === day.value ? "selected" : ""}
                type="button"
                role="tab"
                aria-selected={selectedDay === day.value}
                aria-controls="lesson-period-panel"
                onClick={() => setSelectedDay(day.value)}
              >
                <span>{day.label}</span>
                <small>
                  {day.shortLabel} · {count}
                </small>
              </button>
            );
          })}
        </div>

        <div id="lesson-period-panel" role="tabpanel">
          {periodsQuery.isPending ? (
            <ListLoading />
          ) : periodsQuery.isError ? (
            <QueryError error={periodsQuery.error} onRetry={periodsQuery.refetch} />
          ) : selectedPeriods.length === 0 ? (
            <EmptyDay
              dayLabel={dayLabel(selectedDay)}
              onCreate={() => openForm({ mode: "create" })}
            />
          ) : (
            <div className="class-table-wrap">
              <table className="class-table lesson-period-table">
                <thead>
                  <tr>
                    <th scope="col">Ders</th>
                    <th scope="col">Saat aralığı</th>
                    <th scope="col">Son güncelleme</th>
                    <th scope="col">
                      <span className="visually-hidden">İşlemler</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPeriods.map((period) => (
                    <tr key={period.id}>
                      <td>
                        <strong>{period.lessonNumber}. ders</strong>
                      </td>
                      <td>
                        <span className="time-range">
                          {formatTimeRange(period.startMinute, period.endMinute)}
                        </span>
                      </td>
                      <td className="table-date">{formatDate(period.updatedAt)}</td>
                      <td className="class-actions">
                        <button
                          className="quiet-action"
                          type="button"
                          onClick={() => openForm({ mode: "edit", period })}
                        >
                          Düzenle
                        </button>
                        <button
                          className="quiet-action danger-action"
                          type="button"
                          onClick={() => {
                            resetMutationErrors();
                            setDeleteTarget(period);
                          }}
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {form ? (
        <LessonPeriodForm
          key={form.period?.id ?? `create-${selectedDay}-${nextLessonNumber}`}
          form={form}
          defaultDay={selectedDay}
          nextLessonNumber={nextLessonNumber}
          periods={periods}
          error={mutationError}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
          onClose={() => closeDialog(() => setForm(null))}
          onSubmit={(input) => {
            if (form.mode === "create") {
              createMutation.mutate(input);
              return;
            }

            updateMutation.mutate({
              lessonPeriodId: form.period!.id,
              input,
            });
          }}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteDialog
          period={deleteTarget}
          error={mutationError}
          isSubmitting={deleteMutation.isPending}
          onClose={() => closeDialog(() => setDeleteTarget(null))}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        />
      ) : null}
    </main>
  );
}

function LessonPeriodForm({
  form,
  defaultDay,
  nextLessonNumber,
  periods,
  error,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  form: PeriodFormState;
  defaultDay: DayOfWeek;
  nextLessonNumber: number;
  periods: LessonPeriodSummary[];
  error: unknown;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (input: LessonPeriodInput) => void;
}) {
  const period = form.period;
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(
    period?.dayOfWeek ?? defaultDay,
  );
  const [lessonNumber, setLessonNumber] = useState(
    String(period?.lessonNumber ?? nextLessonNumber),
  );
  const [startTime, setStartTime] = useState(
    minuteToTimeInput(period?.startMinute ?? 480),
  );
  const [endTime, setEndTime] = useState(
    minuteToTimeInput(period?.endMinute ?? 520),
  );
  const [localError, setLocalError] = useState("");
  const startMinute = timeInputToMinute(startTime);
  const endMinute = timeInputToMinute(endTime);
  const overlap =
    startMinute !== null && endMinute !== null
      ? periods.find(
          (candidate) =>
            candidate.id !== period?.id &&
            candidate.dayOfWeek === dayOfWeek &&
            startMinute < candidate.endMinute &&
            endMinute > candidate.startMinute,
        )
      : undefined;
  const isEditing = form.mode === "edit";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedLessonNumber = Number(lessonNumber);

    if (!Number.isInteger(normalizedLessonNumber) || normalizedLessonNumber < 1) {
      setLocalError("Pozitif bir ders numarası yazın.");
      return;
    }

    if (startMinute === null || endMinute === null || startMinute >= endMinute) {
      setLocalError("Başlangıç saati bitiş saatinden önce olmalıdır.");
      return;
    }

    setLocalError("");
    onSubmit({
      dayOfWeek,
      lessonNumber: normalizedLessonNumber,
      startMinute,
      endMinute,
    });
  }

  return (
    <div className="dialog-backdrop">
      <section
        className="dialog-card lesson-period-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lesson-period-form-title"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">DERS ÇİZELGESİ</p>
            <h2 id="lesson-period-form-title">
              {isEditing ? "Ders Saatini Düzenle" : "Ders Saati Ekle"}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Pencereyi kapat"
            onClick={onClose}
            disabled={isSubmitting}
          >
            ×
          </button>
        </div>
        <form className="dialog-form" onSubmit={submit}>
          <div className="lesson-period-form-grid">
            <label>
              Gün
              <select
                value={dayOfWeek}
                onChange={(event) => setDayOfWeek(event.target.value as DayOfWeek)}
              >
                {WEEK_DAYS.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ders Numarası
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={lessonNumber}
                onChange={(event) => setLessonNumber(event.target.value)}
              />
            </label>
            <label>
              Başlangıç
              <input
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </label>
            <label>
              Bitiş
              <input
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </label>
          </div>
          <p className="field-note">
            Saatler Türkiye / İstanbul zamanına göredir. Bu değişiklik hemen
            yürürlüğe girer; geçmiş yoklama saatleri değişmez.
          </p>
          {overlap ? (
            <p className="schedule-overlap-note">
              {dayLabel(dayOfWeek)} günü {overlap.lessonNumber}. ders
              ({formatTimeRange(overlap.startMinute, overlap.endMinute)}) ile
              çakışıyor. Sunucu bu kaydı kabul etmez.
            </p>
          ) : null}
          {localError || error ? (
            <p className="dialog-error">{localError || errorMessage(error)}</p>
          ) : null}
          <div className="dialog-actions">
            <button
              className="secondary-action"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Vazgeç
            </button>
            <button className="primary-action" type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Kaydediliyor…"
                : isEditing
                  ? "Değişiklikleri kaydet"
                  : "Ders saatini ekle"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function DeleteDialog({
  period,
  error,
  isSubmitting,
  onClose,
  onConfirm,
}: {
  period: LessonPeriodSummary;
  error: unknown;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="dialog-backdrop">
      <section
        className="dialog-card confirmation-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="lesson-period-delete-title"
      >
        <p className="eyebrow">DERS SAATİNİ SİL</p>
        <h2 id="lesson-period-delete-title">
          {dayLabel(period.dayOfWeek)} {period.lessonNumber}. ders silinsin mi?
        </h2>
        <p>
          {formatTimeRange(period.startMinute, period.endMinute)} aralığı
          çizelgeden kaldırılır. Geçmiş yoklamalar değişmez; bu tanım olmadan
          ilgili gün ve ders numarası için yeni yoklama doğrulanamaz.
        </p>
        {error ? <p className="dialog-error">{errorMessage(error)}</p> : null}
        <div className="dialog-actions">
          <button
            className="secondary-action"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Vazgeç
          </button>
          <button
            className="danger-button"
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Siliniyor…" : "Ders saatini sil"}
          </button>
        </div>
      </section>
    </div>
  );
}

function EmptyDay({
  dayLabel,
  onCreate,
}: {
  dayLabel: string;
  onCreate: () => void;
}) {
  return (
    <div className="class-empty-state lesson-period-empty-state">
      <div className="empty-symbol" aria-hidden="true">
        ◷
      </div>
      <h3>{dayLabel} için ders saati yok.</h3>
      <p>Bu günde yoklama doğrulanamaz. İlk ders saatini ekleyin.</p>
      <button className="primary-action" type="button" onClick={onCreate}>
        İlk ders saatini ekle
      </button>
    </div>
  );
}

function ListLoading() {
  return (
    <div className="class-loading" aria-live="polite">
      <span />
      <span />
      <span />
      <p>Ders saatleri yükleniyor…</p>
    </div>
  );
}

function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="class-empty-state error-state">
      <div className="empty-symbol" aria-hidden="true">
        !
      </div>
      <h3>Ders saatleri yüklenemedi.</h3>
      <p>{errorMessage(error)}</p>
      <button className="secondary-action" type="button" onClick={onRetry}>
        Tekrar dene
      </button>
    </div>
  );
}

function dayLabel(dayOfWeek: DayOfWeek): string {
  return WEEK_DAYS.find((day) => day.value === dayOfWeek)?.label ?? dayOfWeek;
}

function minuteToTimeInput(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function timeInputToMinute(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function formatTimeRange(startMinute: number, endMinute: number): string {
  return `${minuteToTimeInput(startMinute)}–${minuteToTimeInput(endMinute)}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  }).format(new Date(value));
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
}
