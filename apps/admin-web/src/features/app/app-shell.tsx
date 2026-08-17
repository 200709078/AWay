import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const schoolQuery = useQuery({
    queryKey: ["school-context", schoolId],
    queryFn: () => getSchoolContext(request, schoolId!),
    enabled: Boolean(schoolId),
  });

  useEffect(() => {
    if (!userMenuOpen) {
      return;
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenuOpen]);

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
            <small className="school-user">
              {user.firstName} {user.lastName}
            </small>
          </NavLink>
          <div className="user-menu" ref={userMenuRef}>
            <button
              className="profile-button"
              type="button"
              aria-expanded={userMenuOpen}
              aria-haspopup="menu"
              aria-label="Hesap sahibi menüsü"
              onClick={() => setUserMenuOpen((open) => !open)}
            >
              <span>
                {user.firstName.slice(0, 1)}
                {user.lastName.slice(0, 1)}
              </span>
            </button>
            {userMenuOpen ? (
              <div className="user-menu-panel" role="menu">
                <button
                  className="user-menu-item"
                  type="button"
                  role="menuitem"
                  disabled
                  title="Yakında"
                >
                  Profil Ayarları
                  <small>Yakında</small>
                </button>
                <button
                  className="user-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate("/select-school");
                  }}
                >
                  Okul Değiştir
                </button>
                <button
                  className="user-menu-item logout"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    void signOut().finally(() =>
                      navigate("/sign-in", { replace: true }),
                    );
                  }}
                >
                  Çıkış
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <div className="app-body">
        <nav className="side-nav" aria-label="Ana menü">
          <span className="nav-label">YÖNETİM</span>
          <NavLink
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            to={`/schools/${school.id}/dashboard`}
          >
            GİRİŞ
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
