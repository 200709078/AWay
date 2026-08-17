import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useOutletContext } from "react-router";
import { ApiError } from "../../lib/api";
import type { SchoolShellContext } from "../app/app-shell";
import { useAuth } from "../auth/auth-context";
import {
  archiveClass,
  createClass,
  getClasses,
  restoreClass,
  type ClassStatus,
  type ClassSummary,
  updateClass,
} from "./classes-api";

interface ClassFormState {
  mode: "create" | "edit";
  classroom?: ClassSummary;
}

interface ConfirmationState {
  action: "archive" | "restore";
  classroom: ClassSummary;
}

export function ClassesPage() {
  const { school } = useOutletContext<SchoolShellContext>();
  const { request } = useAuth();
  const queryClient = useQueryClient();
  const schoolId = school.school.id;
  const [status, setStatus] = useState<ClassStatus>("active");
  const [form, setForm] = useState<ClassFormState | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(
    null,
  );

  const classesQuery = useQuery({
    queryKey: ["classes", schoolId, status],
    queryFn: () => getClasses(request, schoolId, status),
    retry: false,
  });

  const invalidateClasses = async () => {
    await queryClient.invalidateQueries({ queryKey: ["classes", schoolId] });
  };

  const createMutation = useMutation({
    mutationFn: (name: string) => createClass(request, schoolId, name),
    onSuccess: async () => {
      setForm(null);
      await invalidateClasses();
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ classId, name }: { classId: string; name: string }) =>
      updateClass(request, schoolId, classId, name),
    onSuccess: async () => {
      setForm(null);
      await invalidateClasses();
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (classId: string) => archiveClass(request, schoolId, classId),
    onSuccess: async () => {
      setConfirmation(null);
      await invalidateClasses();
    },
  });
  const restoreMutation = useMutation({
    mutationFn: (classId: string) => restoreClass(request, schoolId, classId),
    onSuccess: async () => {
      setConfirmation(null);
      await invalidateClasses();
    },
  });

  const mutationError =
    createMutation.error ??
    updateMutation.error ??
    archiveMutation.error ??
    restoreMutation.error;
  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    archiveMutation.isPending ||
    restoreMutation.isPending;

  function resetMutationErrors() {
    createMutation.reset();
    updateMutation.reset();
    archiveMutation.reset();
    restoreMutation.reset();
  }

  function openForm(nextForm: ClassFormState) {
    resetMutationErrors();
    setForm(nextForm);
  }

  function openConfirmation(nextConfirmation: ConfirmationState) {
    resetMutationErrors();
    setConfirmation(nextConfirmation);
  }

  return (
    <main className="management-page">
      <header className="management-heading">
        <div>
          <p className="eyebrow">YAPILANDIRMA</p>
          <h1>Sınıflar</h1>
          <p>
            Yoklama için kullanılacak güncel sınıf listesini yönetin. Sınıf
            arşivlendiğinde geçmiş kayıtlar korunur.
          </p>
        </div>
        <button
          className="primary-action"
          type="button"
          onClick={() => openForm({ mode: "create" })}
        >
          <span aria-hidden="true">+</span> Sınıf Ekle
        </button>
      </header>

      <section className="management-card" aria-labelledby="class-list-title">
        <div className="list-toolbar">
          <div>
            <h2 id="class-list-title">
              {status === "active" ? "Aktif Sınıflar" : "Arşivlenmiş Sınıflar"}
            </h2>
            <p>
              {status === "active"
                ? "Öğrenci ve yoklama işlemlerinde görünen sınıflar."
                : "Aynı sınıf adını tekrar kullanmak için önce bu kaydı geri yükleyin."}
            </p>
          </div>
          <div className="segmented-control" aria-label="Sınıf durumu">
            <button
              className={status === "active" ? "selected" : ""}
              type="button"
              onClick={() => setStatus("active")}
              aria-pressed={status === "active"}
            >
              Aktif
            </button>
            <button
              className={status === "archived" ? "selected" : ""}
              type="button"
              onClick={() => setStatus("archived")}
              aria-pressed={status === "archived"}
            >
              Arşiv
            </button>
          </div>
        </div>

        {classesQuery.isPending ? (
          <ListLoading />
        ) : classesQuery.isError ? (
          <QueryError error={classesQuery.error} onRetry={classesQuery.refetch} />
        ) : classesQuery.data.length === 0 ? (
          <EmptyClasses
            status={status}
            onCreate={() => openForm({ mode: "create" })}
          />
        ) : (
          <div className="class-table-wrap">
            <table className="class-table">
              <thead>
                <tr>
                  <th scope="col">Sınıf</th>
                  <th scope="col">Aktif öğrenci</th>
                  <th scope="col">
                    {status === "active" ? "Son güncelleme" : "Arşivlenme"}
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">İşlemler</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {classesQuery.data.map((classroom) => (
                  <ClassRow
                    key={classroom.id}
                    classroom={classroom}
                    status={status}
                    onEdit={() => openForm({ mode: "edit", classroom })}
                    onConfirm={() =>
                      openConfirmation({
                        action: status === "active" ? "archive" : "restore",
                        classroom,
                      })
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {form ? (
        <ClassForm
          key={form.classroom?.id ?? "create"}
          form={form}
          error={mutationError}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
          onClose={() => {
            if (!isMutating) {
              setForm(null);
              resetMutationErrors();
            }
          }}
          onSubmit={(name) => {
            if (form.mode === "create") {
              createMutation.mutate(name);
              return;
            }

            updateMutation.mutate({ classId: form.classroom!.id, name });
          }}
        />
      ) : null}

      {confirmation ? (
        <ConfirmationDialog
          confirmation={confirmation}
          error={mutationError}
          isSubmitting={archiveMutation.isPending || restoreMutation.isPending}
          onClose={() => {
            if (!isMutating) {
              setConfirmation(null);
              resetMutationErrors();
            }
          }}
          onConfirm={() => {
            if (confirmation.action === "archive") {
              archiveMutation.mutate(confirmation.classroom.id);
              return;
            }

            restoreMutation.mutate(confirmation.classroom.id);
          }}
        />
      ) : null}
    </main>
  );
}

function ClassRow({
  classroom,
  status,
  onEdit,
  onConfirm,
}: {
  classroom: ClassSummary;
  status: ClassStatus;
  onEdit: () => void;
  onConfirm: () => void;
}) {
  const hasActiveStudents = classroom.studentCount > 0;

  return (
    <tr>
      <td>
        <strong>{classroom.name}</strong>
      </td>
      <td>
        <span className="student-count">{classroom.studentCount}</span>
      </td>
      <td className="table-date">
        {formatDate(status === "active" ? classroom.updatedAt : classroom.deletedAt)}
      </td>
      <td className="class-actions">
        {status === "active" ? (
          <>
            <button className="quiet-action" type="button" onClick={onEdit}>
              Düzenle
            </button>
            <button
              className="quiet-action danger-action"
              type="button"
              onClick={onConfirm}
              disabled={hasActiveStudents}
              title={
                hasActiveStudents
                  ? "Aktif öğrencileri olan sınıf arşivlenemez."
                  : undefined
              }
            >
              Arşivle
            </button>
          </>
        ) : (
          <button className="quiet-action" type="button" onClick={onConfirm}>
            Geri yükle
          </button>
        )}
      </td>
    </tr>
  );
}

function ClassForm({
  form,
  error,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  form: ClassFormState;
  error: unknown;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(form.classroom?.name ?? "");
  const [localError, setLocalError] = useState("");
  const isEditing = form.mode === "edit";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim().replace(/\s+/g, " ");

    if (!trimmedName) {
      setLocalError("Sınıf adını yazın.");
      return;
    }

    onSubmit(trimmedName);
  }

  return (
    <div className="dialog-backdrop">
      <section
        className="dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="class-form-title"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">SINIF YÖNETİMİ</p>
            <h2 id="class-form-title">
              {isEditing ? "Sınıf adını düzenle" : "Yeni sınıf ekle"}
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
          <label htmlFor="class-name">Sınıf adı</label>
          <input
            id="class-name"
            autoFocus
            maxLength={80}
            placeholder="Örn. 9-A"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setLocalError("");
            }}
            disabled={isSubmitting}
          />
          <p className="field-note">En fazla 80 karakter kullanabilirsiniz.</p>
          {localError ? <p className="dialog-error">{localError}</p> : null}
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
            <button className="primary-action" type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Kaydediliyor…"
                : isEditing
                  ? "Değişiklikleri kaydet"
                  : "Sınıfı ekle"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ConfirmationDialog({
  confirmation,
  error,
  isSubmitting,
  onClose,
  onConfirm,
}: {
  confirmation: ConfirmationState;
  error: unknown;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const isArchiving = confirmation.action === "archive";

  return (
    <div className="dialog-backdrop">
      <section
        className="dialog-card confirmation-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="class-confirmation-title"
      >
        <p className="eyebrow">{isArchiving ? "ARŞİVLE" : "GERİ YÜKLE"}</p>
        <h2 id="class-confirmation-title">
          {isArchiving
            ? `${confirmation.classroom.name} arşivlensin mi?`
            : `${confirmation.classroom.name} geri yüklensin mi?`}
        </h2>
        <p>
          {isArchiving
            ? "Sınıf yeni öğrenci ve yoklama işlemlerinde görünmez. Geçmiş yoklamalar silinmez."
            : "Sınıf yeniden aktif listede görünür ve öğrenci/yoklama işlemlerinde kullanılabilir."}
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
            className={isArchiving ? "danger-button" : "primary-action"}
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? "İşleniyor…"
              : isArchiving
                ? "Sınıfı arşivle"
                : "Geri yükle"}
          </button>
        </div>
      </section>
    </div>
  );
}

function EmptyClasses({
  status,
  onCreate,
}: {
  status: ClassStatus;
  onCreate: () => void;
}) {
  return (
    <div className="class-empty-state">
      <div className="empty-symbol" aria-hidden="true">
        {status === "active" ? "+" : "□"}
      </div>
      <h3>
        {status === "active" ? "Henüz aktif sınıf yok." : "Arşivlenmiş sınıf yok."}
      </h3>
      <p>
        {status === "active"
          ? "Öğrenci ve yoklama eklemeden önce ilk sınıfınızı oluşturun."
          : "Arşivlediğiniz sınıflar burada görünür."}
      </p>
      {status === "active" ? (
        <button className="primary-action" type="button" onClick={onCreate}>
          İlk Sınıfı Ekle
        </button>
      ) : null}
    </div>
  );
}

function ListLoading() {
  return (
    <div className="class-loading" aria-live="polite">
      <span />
      <span />
      <span />
      <p>Sınıflar yükleniyor…</p>
    </div>
  );
}

function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="class-empty-state error-state">
      <div className="empty-symbol" aria-hidden="true">
        !
      </div>
      <h3>Sınıflar yüklenemedi.</h3>
      <p>{errorMessage(error)}</p>
      <button className="secondary-action" type="button" onClick={onRetry}>
        Tekrar dene
      </button>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

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
