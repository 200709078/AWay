import { useQuery } from "@tanstack/react-query";
import {
  Navigate,
  NavLink,
  Outlet,
  useNavigate,
  useParams,
} from "react-router";
import { ApiError } from "../../lib/api";
import { useAuth } from "../auth/auth-context";
import { getSchoolContext, type SchoolContext } from "./school-api";

export function AuthenticatedLayout() {
  const { accessToken, isRestoring, user } = useAuth();

  if (isRestoring) {
    return <LoadingScreen label="Oturumunuz doğrulanıyor…" />;
  }

  if (!accessToken || !user) {
    return <Navigate to="/sign-in" replace />;
  }

  return <Outlet />;
}

export function SchoolShell() {
  const navigate = useNavigate();
  const { schoolId } = useParams();
  const { request, signOut, user } = useAuth();
  const schoolQuery = useQuery({
    queryKey: ["school-context", schoolId],
    queryFn: () => getSchoolContext(request, schoolId!),
    enabled: Boolean(schoolId),
  });

  if (!user) {
    return <Navigate to="/sign-in" replace />;
  }

  if (schoolQuery.isPending) {
    return <LoadingScreen label="Okul bağlamı doğrulanıyor…" />;
  }

  if (schoolQuery.isError || !schoolQuery.data) {
    return (
      <AccessError
        title={
          schoolQuery.error instanceof ApiError &&
          schoolQuery.error.status === 403
            ? "Bu okula erişiminiz yok."
            : "Okul bilgilerinize ulaşılamadı."
        }
        onBack={() => navigate("/select-school", { replace: true })}
      />
    );
  }

  if (!schoolQuery.data.roles.includes("ADMIN")) {
    return (
      <AccessError
        title="Bu okul için yönetici yetkiniz yok."
        onBack={() => navigate("/select-school", { replace: true })}
      />
    );
  }

  const school = schoolQuery.data.school;

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink className="brand" to={`/schools/${school.id}/dashboard`}>
          AWay
        </NavLink>
        <div className="header-actions">
          <NavLink className="school-select" to="/select-school">
            <span>{school.name}</span>
            <small>{school.code} · ADMIN</small>
          </NavLink>
          <button
            className="profile-button"
            type="button"
            onClick={() => {
              void signOut().finally(() =>
                navigate("/sign-in", { replace: true }),
              );
            }}
          >
            <span>
              {user.firstName.slice(0, 1)}
              {user.lastName.slice(0, 1)}
            </span>
            Çıkış
          </button>
        </div>
      </header>
      <div className="app-body">
        <nav className="side-nav" aria-label="Ana menü">
          <span className="nav-label">YÖNETİM</span>
          <NavLink
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            to={`/schools/${school.id}/dashboard`}
          >
            Bugün
          </NavLink>
          <NavLink
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            to={`/schools/${school.id}/attendances`}
          >
            Yoklamalar
          </NavLink>
          <span className="nav-label">YAPILANDIRMA</span>
          <NavLink
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            to={`/schools/${school.id}/classes`}
          >
            Sınıflar
          </NavLink>
          <NavLink
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            to={`/schools/${school.id}/students`}
          >
            Öğrenciler
          </NavLink>
          <NavLink
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            to={`/schools/${school.id}/teachers`}
          >
            Öğretmenler
          </NavLink>
          <NavLink
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            to={`/schools/${school.id}/lesson-periods`}
          >
            Ders saatleri
          </NavLink>
        </nav>
        <Outlet context={{ school: schoolQuery.data }} />
      </div>
    </div>
  );
}

export interface SchoolShellContext {
  school: SchoolContext;
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <main className="loading-screen" aria-live="polite">
      <div className="loading-mark" aria-hidden="true" />
      <p>{label}</p>
    </main>
  );
}

function AccessError({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <main className="error-screen">
      <div className="error-card">
        <p className="eyebrow">ERİŞİM HATASI</p>
        <h1>{title}</h1>
        <p>Yönetim alanı yalnız aktif ADMIN okul üyeliklerine açıktır.</p>
        <button type="button" onClick={onBack}>
          Okul seçimine dön
        </button>
      </div>
    </main>
  );
}
