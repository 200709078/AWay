import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useDeferredValue,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { useOutletContext } from "react-router";
import { ApiError } from "../../lib/api";
import type { SchoolShellContext } from "../app/app-shell";
import { useAuth } from "../auth/auth-context";
import {
  archiveTeacher,
  createTeacher,
  getTeachers,
  restoreTeacher,
  type CreateTeacherInput,
  type TeacherStatus,
  type TeacherSummary,
} from "./teachers-api";

const PAGE_SIZE = 25;

interface ConfirmationState {
  action: "archive" | "restore";
  teacher: TeacherSummary;
}

export function TeachersPage() {
  const { school } = useOutletContext<SchoolShellContext>();
  const { request } = useAuth();
  const queryClient = useQueryClient();
  const schoolId = school.school.id;
  const [status, setStatus] = useState<TeacherStatus>("active");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(
    null,
  );

  const teachersQuery = useQuery({
    queryKey: ["teachers", schoolId, status, deferredSearch, page],
    queryFn: () =>
      getTeachers(request, schoolId, {
        status,
        search: deferredSearch || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    retry: false,
  });

  useEffect(() => {
    setPage(1);
  }, [status, deferredSearch]);

  const invalidateTeachers = async () => {
    await queryClient.invalidateQueries({ queryKey: ["teachers", schoolId] });
  };
  const createMutation = useMutation({
    mutationFn: (input: CreateTeacherInput) => createTeacher(request, schoolId, input),
    retry: false,
    onSuccess: async () => {
      setIsFormOpen(false);
      await invalidateTeachers();
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (teacherMembershipId: string) =>
      archiveTeacher(request, schoolId, teacherMembershipId),
    retry: false,
    onSuccess: async () => {
      setConfirmation(null);
      await invalidateTeachers();
    },
  });
  const restoreMutation = useMutation({
    mutationFn: (teacherMembershipId: string) =>
      restoreTeacher(request, schoolId, teacherMembershipId),
    retry: false,
    onSuccess: async () => {
      setConfirmation(null);
      await invalidateTeachers();
    },
  });

  const mutationError =
    createMutation.error ?? archiveMutation.error ?? restoreMutation.error;
  const isMutating =
    createMutation.isPending || archiveMutation.isPending || restoreMutation.isPending;
  const totalPages = teachersQuery.data
    ? Math.max(1, Math.ceil(teachersQuery.data.total / teachersQuery.data.pageSize))
    : 1;

  function resetMutationErrors() {
    createMutation.reset();
    archiveMutation.reset();
    restoreMutation.reset();
  }

  return (
    <main className="management-page teachers-page">
      <header className="management-heading">
        <div>
          <p className="eyebrow">YAPILANDIRMA</p>
          <h1>Öğretmenler</h1>
          <p>
            Öğretmenleri telefon numarasıyla bu okula tanımlayın. İlk girişte
            telefon sahibi OTP ile hesabını doğrular.
          </p>
        </div>
        <button
          className="primary-action"
          type="button"
          onClick={() => {
            resetMutationErrors();
            setIsFormOpen(true);
          }}
        >
          <span aria-hidden="true">+</span> Öğretmen ekle
        </button>
      </header>

      <section className="management-card" aria-labelledby="teacher-list-title">
        <div className="list-toolbar student-list-toolbar">
          <div>
            <h2 id="teacher-list-title">
              {status === "active" ? "Aktif öğretmenler" : "Erişimi kapatılmış öğretmenler"}
            </h2>
            <p>
              {status === "active"
                ? "Bu okul için telefonla OTP girişi ve yoklama erişimi olan üyeler."
                : "Aynı telefonla yeniden erişim vermek için mevcut üyeliği geri yükleyin."}
            </p>
          </div>
          <div className="segmented-control" aria-label="Öğretmen durumu">
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

        <div className="student-filters teacher-filters">
          <label className="student-search">
            <span className="visually-hidden">Öğretmen ara</span>
            <input
              type="search"
              placeholder="Ad veya soyad ara"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {search ? (
            <button
              className="filter-reset"
              type="button"
              onClick={() => setSearch("")}
            >
              Aramayı temizle
            </button>
          ) : null}
        </div>

        {teachersQuery.isPending ? (
          <TeacherLoading />
        ) : teachersQuery.isError || !teachersQuery.data ? (
          <TeacherQueryError
            error={teachersQuery.error}
            onRetry={() => void teachersQuery.refetch()}
          />
        ) : teachersQuery.data.items.length === 0 ? (
          <TeacherEmptyState
            status={status}
            hasSearch={Boolean(deferredSearch)}
            onCreate={() => {
              resetMutationErrors();
              setIsFormOpen(true);
            }}
            onClearSearch={() => setSearch("")}
          />
        ) : (
          <>
            <div className="class-table-wrap">
              <table className="class-table teacher-table">
                <thead>
                  <tr>
                    <th scope="col">Öğretmen</th>
                    <th scope="col">Telefon</th>
                    <th scope="col">Giriş durumu</th>
                    <th scope="col">
                      {status === "active" ? "Yetki başlangıcı" : "Erişim kapatma"}
                    </th>
                    <th scope="col"><span className="visually-hidden">İşlemler</span></th>
                  </tr>
                </thead>
                <tbody>
                  {teachersQuery.data.items.map((teacher) => (
                    <tr key={teacher.id}>
                      <td><strong>{teacher.firstName} {teacher.lastName}</strong></td>
                      <td className="teacher-phone">{teacher.account.phoneMasked}</td>
                      <td><TeacherAccountBadge status={teacher.account.status} /></td>
                      <td className="table-date">
                        {formatDate(status === "active" ? teacher.createdAt : teacher.deletedAt)}
                      </td>
                      <td className="class-actions">
                        <button
                          className={`quiet-action ${status === "active" ? "danger-action" : ""}`}
                          type="button"
                          onClick={() => {
                            resetMutationErrors();
                            setConfirmation({
                              action: status === "active" ? "archive" : "restore",
                              teacher,
                            });
                          }}
                        >
                          {status === "active" ? "Erişimi kapat" : "Geri yükle"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TeacherPagination
              page={teachersQuery.data.page}
              totalPages={totalPages}
              total={teachersQuery.data.total}
              onChange={setPage}
            />
          </>
        )}
      </section>

      {isFormOpen ? (
        <TeacherForm
          error={mutationError}
          isSubmitting={createMutation.isPending}
          onClose={() => {
            if (!isMutating) {
              setIsFormOpen(false);
              resetMutationErrors();
            }
          }}
          onSubmit={(input) => createMutation.mutate(input)}
        />
      ) : null}

      {confirmation ? (
        <TeacherConfirmation
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
              archiveMutation.mutate(confirmation.teacher.id);
              return;
            }

            restoreMutation.mutate(confirmation.teacher.id);
          }}
        />
      ) : null}
    </main>
  );
}

function TeacherForm({
  error,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  error: unknown;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (input: CreateTeacherInput) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [localError, setLocalError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedFirstName = firstName.trim().replace(/\s+/g, " ");
    const normalizedLastName = lastName.trim().replace(/\s+/g, " ");
    const normalizedPhone = phone.trim();

    if (!normalizedFirstName || !normalizedLastName || !normalizedPhone) {
      setLocalError("Ad, soyad ve telefon numarasını yazın.");
      return;
    }

    onSubmit({
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      phone: normalizedPhone,
    });
  }

  return (
    <div className="dialog-backdrop">
      <section
        className="dialog-card teacher-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="teacher-form-title"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">ÖĞRETMEN ERİŞİMİ</p>
            <h2 id="teacher-form-title">Öğretmen ekle</h2>
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
          <div className="student-form-grid">
            <label htmlFor="teacher-first-name">
              Ad
              <input
                id="teacher-first-name"
                autoFocus
                maxLength={80}
                value={firstName}
                onChange={(event) => {
                  setFirstName(event.target.value);
                  setLocalError("");
                }}
                disabled={isSubmitting}
              />
            </label>
            <label htmlFor="teacher-last-name">
              Soyad
              <input
                id="teacher-last-name"
                maxLength={80}
                value={lastName}
                onChange={(event) => {
                  setLastName(event.target.value);
                  setLocalError("");
                }}
                disabled={isSubmitting}
              />
            </label>
          </div>
          <label className="phone-field" htmlFor="teacher-phone">
            Telefon numarası
            <input
              id="teacher-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={32}
              placeholder="05xx xxx xx xx"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
                setLocalError("");
              }}
              disabled={isSubmitting}
            />
          </label>
          <div className="account-note">
            <span aria-hidden="true">◷</span>
            <p>
              Bu işlem SMS göndermez. Öğretmen kendi giriş ekranından telefon
              numarasıyla OTP ister. Var olan global hesabın adı veya telefonu
              değiştirilmez.
            </p>
          </div>
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
              {isSubmitting ? "Ekleniyor…" : "Öğretmeni ekle"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function TeacherConfirmation({
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
  const fullName = `${confirmation.teacher.firstName} ${confirmation.teacher.lastName}`;

  return (
    <div className="dialog-backdrop">
      <section
        className="dialog-card confirmation-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="teacher-confirmation-title"
      >
        <p className="eyebrow">{isArchiving ? "ERİŞİMİ KAPAT" : "ERİŞİMİ GERİ YÜKLE"}</p>
        <h2 id="teacher-confirmation-title">
          {isArchiving
            ? `${fullName} için öğretmen erişimi kapatılsın mı?`
            : `${fullName} için öğretmen erişimi geri yüklensin mi?`}
        </h2>
        <p>
          {isArchiving
            ? "Yalnız bu okulun TEACHER üyeliği kapanır. Aynı kişinin diğer okul veya ADMIN, PARENT ve STUDENT rolleri etkilenmez."
            : "Yalnız bu okul için TEACHER üyeliği yeniden etkinleşir; öğretmen telefonuyla OTP girişi yapabilir."}
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
                ? "Erişimi kapat"
                : "Erişimi geri yükle"}
          </button>
        </div>
      </section>
    </div>
  );
}

function TeacherAccountBadge({ status }: { status: TeacherSummary["account"]["status"] }) {
  const verified = status === "VERIFIED";

  return (
    <span className={`account-badge ${verified ? "verified" : "waiting"}`}>
      {verified ? "Telefon doğrulandı" : "Telefon doğrulaması bekleniyor"}
    </span>
  );
}

function TeacherPagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return <p className="teacher-result-count">{total} kayıt</p>;
  }

  return (
    <div className="teacher-pagination">
      <span>{total} kayıt · {page}/{totalPages}. sayfa</span>
      <div>
        <button
          className="secondary-action"
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
        >
          Önceki
        </button>
        <button
          className="secondary-action"
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
        >
          Sonraki
        </button>
      </div>
    </div>
  );
}

function TeacherEmptyState({
  status,
  hasSearch,
  onCreate,
  onClearSearch,
}: {
  status: TeacherStatus;
  hasSearch: boolean;
  onCreate: () => void;
  onClearSearch: () => void;
}) {
  const isActive = status === "active";

  return (
    <div className="class-empty-state">
      <div className="empty-symbol" aria-hidden="true">{hasSearch ? "⌕" : isActive ? "+" : "□"}</div>
      <h3>
        {hasSearch
          ? "Aramanızla eşleşen öğretmen yok."
          : isActive
            ? "Henüz aktif öğretmen yok."
            : "Erişimi kapatılmış öğretmen yok."}
      </h3>
      <p>
        {hasSearch
          ? "Farklı bir ad veya soyad arayabilir ya da aramayı temizleyebilirsiniz."
          : isActive
            ? "Yoklama gönderecek kişileri telefon numaralarıyla önceden tanımlayın."
            : "Erişimini kapattığınız öğretmenler burada görünür."}
      </p>
      {hasSearch ? (
        <button className="secondary-action" type="button" onClick={onClearSearch}>
          Aramayı temizle
        </button>
      ) : isActive ? (
        <button className="primary-action" type="button" onClick={onCreate}>
          İlk öğretmeni ekle
        </button>
      ) : null}
    </div>
  );
}

function TeacherLoading() {
  return (
    <div className="class-loading" aria-live="polite">
      <span />
      <span />
      <span />
      <p>Öğretmenler yükleniyor…</p>
    </div>
  );
}

function TeacherQueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="class-empty-state error-state">
      <div className="empty-symbol" aria-hidden="true">!</div>
      <h3>Öğretmenler yüklenemedi.</h3>
      <p>{errorMessage(error)}</p>
      <button className="secondary-action" type="button" onClick={onRetry}>
        Tekrar dene
      </button>
    </div>
  );
}

function formatDate(value: string | null) {
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

function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
}
