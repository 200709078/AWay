import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useDeferredValue,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { NavLink, useOutletContext } from "react-router";
import { ApiError } from "../../lib/api";
import type { SchoolShellContext } from "../app/app-shell";
import { getClasses, type ClassSummary } from "../classes/classes-api";
import { useAuth } from "../auth/auth-context";
import {
  archiveStudent,
  createStudent,
  getStudents,
  provisionStudentAccount,
  restoreStudent,
  type CreateStudentInput,
  type StudentStatus,
  type StudentSummary,
  type UpdateStudentInput,
  updateStudent,
} from "./students-api";

const PAGE_SIZE = 25;

interface StudentFormState {
  mode: "create" | "edit";
  student?: StudentSummary;
}

interface ConfirmationState {
  action: "archive" | "restore";
  student: StudentSummary;
}

export function StudentsPage() {
  const { school } = useOutletContext<SchoolShellContext>();
  const { request } = useAuth();
  const queryClient = useQueryClient();
  const schoolId = school.school.id;
  const [status, setStatus] = useState<StudentStatus>("active");
  const [classId, setClassId] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<StudentFormState | null>(null);
  const [provisionTarget, setProvisionTarget] = useState<StudentSummary | null>(
    null,
  );
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(
    null,
  );

  const classesQuery = useQuery({
    queryKey: ["classes", schoolId, "active"],
    queryFn: () => getClasses(request, schoolId, "active"),
    retry: false,
  });
  const studentsQuery = useQuery({
    queryKey: [
      "students",
      schoolId,
      status,
      classId || null,
      deferredSearch,
      page,
    ],
    queryFn: () =>
      getStudents(request, schoolId, {
        status,
        classId: classId || undefined,
        search: deferredSearch || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    retry: false,
  });

  useEffect(() => {
    setPage(1);
  }, [status, classId, deferredSearch]);

  const invalidateStudents = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["students", schoolId] }),
      queryClient.invalidateQueries({ queryKey: ["classes", schoolId] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (input: CreateStudentInput) =>
      createStudent(request, schoolId, input),
    retry: false,
    onSuccess: async () => {
      setForm(null);
      await invalidateStudents();
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ studentId, input }: { studentId: string; input: UpdateStudentInput }) =>
      updateStudent(request, schoolId, studentId, input),
    retry: false,
    onSuccess: async () => {
      setForm(null);
      await invalidateStudents();
    },
  });
  const provisionMutation = useMutation({
    mutationFn: ({ studentId, phone }: { studentId: string; phone: string }) =>
      provisionStudentAccount(request, schoolId, studentId, phone),
    retry: false,
    onSuccess: async () => {
      setProvisionTarget(null);
      await invalidateStudents();
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (studentId: string) => archiveStudent(request, schoolId, studentId),
    retry: false,
    onSuccess: async () => {
      setConfirmation(null);
      await invalidateStudents();
    },
  });
  const restoreMutation = useMutation({
    mutationFn: (studentId: string) => restoreStudent(request, schoolId, studentId),
    retry: false,
    onSuccess: async () => {
      setConfirmation(null);
      await invalidateStudents();
    },
  });

  const mutationError =
    createMutation.error ??
    updateMutation.error ??
    provisionMutation.error ??
    archiveMutation.error ??
    restoreMutation.error;
  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    provisionMutation.isPending ||
    archiveMutation.isPending ||
    restoreMutation.isPending;
  const hasClasses = Boolean(classesQuery.data?.length);

  function resetMutationErrors() {
    createMutation.reset();
    updateMutation.reset();
    provisionMutation.reset();
    archiveMutation.reset();
    restoreMutation.reset();
  }

  function openForm(nextForm: StudentFormState) {
    resetMutationErrors();
    setForm(nextForm);
  }

  function closeDialog(setDialog: () => void) {
    if (!isMutating) {
      setDialog();
      resetMutationErrors();
    }
  }

  return (
    <main className="management-page students-page">
      <header className="management-heading">
        <div>
          <p className="eyebrow">YAPILANDIRMA</p>
          <h1>Öğrenciler</h1>
          <p>
            Güncel sınıf mevcudunu yönetin. Telefon hesabı isteğe bağlıdır ve
            ilk girişte OTP ile doğrulanır.
          </p>
        </div>
        <button
          className="primary-action"
          type="button"
          onClick={() => openForm({ mode: "create" })}
          disabled={!hasClasses || classesQuery.isPending}
          title={!hasClasses ? "Önce en az bir aktif sınıf ekleyin." : undefined}
        >
          <span aria-hidden="true">+</span> Öğrenci ekle
        </button>
      </header>

      {!classesQuery.isPending && !hasClasses ? (
        <section className="setup-warning" aria-label="Sınıf kurulumu gerekli">
          <div>
            <p className="eyebrow">ÖN KOŞUL</p>
            <h2>Önce bir sınıf ekleyin.</h2>
            <p>Her öğrenci aktif bir sınıfa bağlı olmalıdır.</p>
          </div>
          <NavLink className="secondary-action" to={`/schools/${schoolId}/classes`}>
            Sınıflara git
          </NavLink>
        </section>
      ) : null}

      <section className="management-card" aria-labelledby="student-list-title">
        <div className="list-toolbar student-list-toolbar">
          <div>
            <h2 id="student-list-title">
              {status === "active" ? "Aktif öğrenciler" : "Arşivlenmiş öğrenciler"}
            </h2>
            <p>
              {status === "active"
                ? "Yoklama listesinde görünen güncel öğrenci kayıtları."
                : "Aynı numara veya hesapla yeni kayıt açmak yerine bu kaydı geri yükleyin."}
            </p>
          </div>
          <div className="segmented-control" aria-label="Öğrenci durumu">
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

        <div className="student-filters">
          <label>
            <span className="visually-hidden">Sınıfa göre filtrele</span>
            <select
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              disabled={classesQuery.isPending}
            >
              <option value="">Tüm sınıflar</option>
              {classesQuery.data?.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name}
                </option>
              ))}
            </select>
          </label>
          <label className="student-search">
            <span className="visually-hidden">Öğrenci ara</span>
            <input
              type="search"
              placeholder="No, ad veya soyad ara"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {(classId || search) && (
            <button
              className="filter-reset"
              type="button"
              onClick={() => {
                setClassId("");
                setSearch("");
              }}
            >
              Filtreleri temizle
            </button>
          )}
        </div>

        {studentsQuery.isPending ? (
          <ListLoading />
        ) : studentsQuery.isError ? (
          <QueryError error={studentsQuery.error} onRetry={studentsQuery.refetch} />
        ) : studentsQuery.data.items.length === 0 ? (
          <EmptyStudents
            status={status}
            filtered={Boolean(classId || deferredSearch)}
            canCreate={hasClasses}
            onCreate={() => openForm({ mode: "create" })}
            onReset={() => {
              setClassId("");
              setSearch("");
            }}
          />
        ) : (
          <>
            <div className="class-table-wrap">
              <table className="class-table student-table">
                <thead>
                  <tr>
                    <th scope="col">No</th>
                    <th scope="col">Öğrenci</th>
                    <th scope="col">Sınıf</th>
                    <th scope="col">Giriş hesabı</th>
                    <th scope="col">
                      {status === "active" ? "Son güncelleme" : "Arşivlenme"}
                    </th>
                    <th scope="col">
                      <span className="visually-hidden">İşlemler</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {studentsQuery.data.items.map((student) => (
                    <StudentRow
                      key={student.id}
                      student={student}
                      status={status}
                      onEdit={() => openForm({ mode: "edit", student })}
                      onProvision={() => {
                        resetMutationErrors();
                        setProvisionTarget(student);
                      }}
                      onConfirm={() => {
                        resetMutationErrors();
                        setConfirmation({
                          action: status === "active" ? "archive" : "restore",
                          student,
                        });
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={studentsQuery.data.page}
              pageSize={studentsQuery.data.pageSize}
              total={studentsQuery.data.total}
              onPageChange={setPage}
            />
          </>
        )}
      </section>

      {form ? (
        <StudentForm
          key={form.student?.id ?? "create"}
          form={form}
          classes={classesQuery.data ?? []}
          error={mutationError}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
          onClose={() => closeDialog(() => setForm(null))}
          onSubmit={(input) => {
            if (form.mode === "create") {
              createMutation.mutate(input as CreateStudentInput);
              return;
            }

            updateMutation.mutate({
              studentId: form.student!.id,
              input: input as UpdateStudentInput,
            });
          }}
        />
      ) : null}

      {provisionTarget ? (
        <ProvisionAccountDialog
          student={provisionTarget}
          error={mutationError}
          isSubmitting={provisionMutation.isPending}
          onClose={() => closeDialog(() => setProvisionTarget(null))}
          onSubmit={(phone) =>
            provisionMutation.mutate({
              studentId: provisionTarget.id,
              phone,
            })
          }
        />
      ) : null}

      {confirmation ? (
        <ConfirmationDialog
          confirmation={confirmation}
          error={mutationError}
          isSubmitting={archiveMutation.isPending || restoreMutation.isPending}
          onClose={() => closeDialog(() => setConfirmation(null))}
          onConfirm={() => {
            if (confirmation.action === "archive") {
              archiveMutation.mutate(confirmation.student.id);
              return;
            }

            restoreMutation.mutate(confirmation.student.id);
          }}
        />
      ) : null}
    </main>
  );
}

function StudentRow({
  student,
  status,
  onEdit,
  onProvision,
  onConfirm,
}: {
  student: StudentSummary;
  status: StudentStatus;
  onEdit: () => void;
  onProvision: () => void;
  onConfirm: () => void;
}) {
  return (
    <tr>
      <td>
        <span className="student-number">{student.number}</span>
      </td>
      <td>
        <strong>
          {student.firstName} {student.lastName}
        </strong>
      </td>
      <td>{student.class.name}</td>
      <td>
        <AccountBadge account={student.account} />
      </td>
      <td className="table-date">
        {formatDate(status === "active" ? student.updatedAt : student.deletedAt)}
      </td>
      <td className="class-actions">
        {status === "active" ? (
          <>
            <button className="quiet-action" type="button" onClick={onEdit}>
              Düzenle
            </button>
            {student.account.status === "NOT_PROVISIONED" ? (
              <button className="quiet-action" type="button" onClick={onProvision}>
                Hesap hazırla
              </button>
            ) : null}
            <button
              className="quiet-action danger-action"
              type="button"
              onClick={onConfirm}
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

function AccountBadge({
  account,
}: {
  account: StudentSummary["account"];
}) {
  if (account.status === "NOT_PROVISIONED") {
    return <span className="account-badge neutral">Hazırlanmadı</span>;
  }

  return (
    <span className={`account-badge ${account.status === "VERIFIED" ? "verified" : "waiting"}`}>
      <span>{account.status === "VERIFIED" ? "Doğrulandı" : "Doğrulama bekliyor"}</span>
      {account.phoneMasked ? <small>{account.phoneMasked}</small> : null}
    </span>
  );
}

function StudentForm({
  form,
  classes,
  error,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  form: StudentFormState;
  classes: ClassSummary[];
  error: unknown;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (input: CreateStudentInput | UpdateStudentInput) => void;
}) {
  const student = form.student;
  const [number, setNumber] = useState(student ? String(student.number) : "");
  const [firstName, setFirstName] = useState(student?.firstName ?? "");
  const [lastName, setLastName] = useState(student?.lastName ?? "");
  const [classId, setClassId] = useState(student?.class.id ?? classes[0]?.id ?? "");
  const [prepareAccount, setPrepareAccount] = useState(false);
  const [phone, setPhone] = useState("");
  const [localError, setLocalError] = useState("");
  const isEditing = form.mode === "edit";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedNumber = Number(number);
    const normalizedFirstName = firstName.trim().replace(/\s+/g, " ");
    const normalizedLastName = lastName.trim().replace(/\s+/g, " ");

    if (!Number.isInteger(normalizedNumber) || normalizedNumber < 1) {
      setLocalError("Pozitif bir öğrenci numarası yazın.");
      return;
    }

    if (!normalizedFirstName || !normalizedLastName || !classId) {
      setLocalError("No, ad, soyad ve sınıf alanlarını doldurun.");
      return;
    }

    if (!isEditing && prepareAccount && !phone.trim()) {
      setLocalError("Telefonla hesap hazırlamak için telefon numarası gerekli.");
      return;
    }

    const input = {
      classId,
      number: normalizedNumber,
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      ...(!isEditing && prepareAccount ? { phone: phone.trim() } : {}),
    };
    onSubmit(input);
  }

  return (
    <div className="dialog-backdrop">
      <section
        className="dialog-card student-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-form-title"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">ÖĞRENCİ YÖNETİMİ</p>
            <h2 id="student-form-title">
              {isEditing ? "Öğrenciyi düzenle" : "Yeni öğrenci ekle"}
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
          <div className="student-form-grid">
            <label>
              Öğrenci no
              <input
                inputMode="numeric"
                type="number"
                min="1"
                max="2147483647"
                value={number}
                onChange={(event) => {
                  setNumber(event.target.value);
                  setLocalError("");
                }}
                disabled={isSubmitting}
              />
            </label>
            <label>
              Sınıf
              <select
                value={classId}
                onChange={(event) => {
                  setClassId(event.target.value);
                  setLocalError("");
                }}
                disabled={isSubmitting}
              >
                {classes.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="student-form-grid">
            <label>
              Ad
              <input
                maxLength={80}
                value={firstName}
                onChange={(event) => {
                  setFirstName(event.target.value);
                  setLocalError("");
                }}
                disabled={isSubmitting}
              />
            </label>
            <label>
              Soyad
              <input
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

          {!isEditing ? (
            <div className="account-setup">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={prepareAccount}
                  onChange={(event) => {
                    setPrepareAccount(event.target.checked);
                    setLocalError("");
                  }}
                  disabled={isSubmitting}
                />
                <span>Bu öğrenci için telefonla giriş hesabı hazırla</span>
              </label>
              {prepareAccount ? (
                <label className="phone-field">
                  Telefon numarası
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="05xx xxx xx xx"
                    value={phone}
                    onChange={(event) => {
                      setPhone(event.target.value);
                      setLocalError("");
                    }}
                    disabled={isSubmitting}
                  />
                </label>
              ) : null}
              <p>
                Bu işlem SMS göndermez. Telefon sahibi ilk girişinde OTP ile
                hesabını doğrular; mevcut global hesap bilgileri değişmez.
              </p>
            </div>
          ) : (
            <div className="account-note">
              <AccountBadge account={student!.account} />
              <p>
                Telefon ve global hesap kimliği bu ekrandan değiştirilemez.
              </p>
            </div>
          )}

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
                  : "Öğrenciyi ekle"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ProvisionAccountDialog({
  student,
  error,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  student: StudentSummary;
  error: unknown;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (phone: string) => void;
}) {
  const [phone, setPhone] = useState("");
  const [localError, setLocalError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!phone.trim()) {
      setLocalError("Telefon numarasını yazın.");
      return;
    }

    onSubmit(phone.trim());
  }

  return (
    <div className="dialog-backdrop">
      <section
        className="dialog-card provision-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="provision-account-title"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">GİRİŞ HESABI</p>
            <h2 id="provision-account-title">
              {student.firstName} için hesap hazırla
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
          <label>
            Telefon numarası
            <input
              autoFocus
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="05xx xxx xx xx"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
                setLocalError("");
              }}
              disabled={isSubmitting}
            />
          </label>
          <p className="dialog-copy">
            SMS şimdi gönderilmez. Telefon sahibi ilk girişte OTP ile doğrular.
            Var olan global kullanıcı bilgileri veya diğer okul rolleri
            değiştirilmez ve burada gösterilmez.
          </p>
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
              {isSubmitting ? "Hazırlanıyor…" : "Hesabı hazırla"}
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
  const name = `${confirmation.student.firstName} ${confirmation.student.lastName}`;

  return (
    <div className="dialog-backdrop">
      <section
        className="dialog-card confirmation-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="student-confirmation-title"
      >
        <p className="eyebrow">{isArchiving ? "ARŞİVLE" : "GERİ YÜKLE"}</p>
        <h2 id="student-confirmation-title">
          {isArchiving ? `${name} arşivlensin mi?` : `${name} geri yüklensin mi?`}
        </h2>
        <p>
          {isArchiving
            ? "Öğrenci aktif yoklama listesinden çıkarılır; geçmiş snapshot kayıtları silinmez. Hazırlanmış STUDENT erişimi kapatılır, diğer roller etkilenmez."
            : "Öğrenci eski sınıfına ve varsa STUDENT erişimine yeniden açılır. Sınıf arşivlendiyse önce sınıfı geri yüklemelisiniz."}
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
                ? "Öğrenciyi arşivle"
                : "Geri yükle"}
          </button>
        </div>
      </section>
    </div>
  );
}

function EmptyStudents({
  status,
  filtered,
  canCreate,
  onCreate,
  onReset,
}: {
  status: StudentStatus;
  filtered: boolean;
  canCreate: boolean;
  onCreate: () => void;
  onReset: () => void;
}) {
  const title = filtered
    ? "Bu filtreyle öğrenci bulunamadı."
    : status === "active"
      ? "Henüz aktif öğrenci yok."
      : "Arşivlenmiş öğrenci yok.";

  return (
    <div className="class-empty-state">
      <div className="empty-symbol" aria-hidden="true">
        {filtered ? "⌕" : status === "active" ? "+" : "□"}
      </div>
      <h3>{title}</h3>
      <p>
        {filtered
          ? "Sınıf filtresini veya arama metnini değiştirip tekrar deneyin."
          : status === "active"
            ? "Yoklama almadan önce sınıf mevcudunu ekleyin."
            : "Arşivlediğiniz öğrenciler burada görünür."}
      </p>
      {filtered ? (
        <button className="secondary-action" type="button" onClick={onReset}>
          Filtreleri temizle
        </button>
      ) : status === "active" && canCreate ? (
        <button className="primary-action" type="button" onClick={onCreate}>
          İlk öğrenciyi ekle
        </button>
      ) : null}
    </div>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="pagination">
      <p>
        {total} öğrenci · Sayfa {page}/{pageCount}
      </p>
      <div>
        <button
          className="secondary-action"
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Önceki
        </button>
        <button
          className="secondary-action"
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Sonraki
        </button>
      </div>
    </div>
  );
}

function ListLoading() {
  return (
    <div className="class-loading" aria-live="polite">
      <span />
      <span />
      <span />
      <p>Öğrenciler yükleniyor…</p>
    </div>
  );
}

function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="class-empty-state error-state">
      <div className="empty-symbol" aria-hidden="true">
        !
      </div>
      <h3>Öğrenciler yüklenemedi.</h3>
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
