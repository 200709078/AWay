import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router";
import { useAuth } from "../auth/auth-context";
import { getMySchools, type SchoolSummary } from "./school-api";

export function SchoolSelectionPage() {
  const navigate = useNavigate();
  const { request, signOut, user } = useAuth();
  const schoolsQuery = useQuery({
    queryKey: ["my-schools"],
    queryFn: () => getMySchools(request),
  });

  if (schoolsQuery.isPending) {
    return (
      <main className="loading-screen" aria-live="polite">
        <div className="loading-mark" aria-hidden="true" />
        <p>Okullarınız hazırlanıyor…</p>
      </main>
    );
  }

  if (schoolsQuery.isError) {
    return (
      <main className="error-screen">
        <div className="error-card">
          <p className="eyebrow">ERİŞİM HATASI</p>
          <h1>Okul listenize ulaşılamadı.</h1>
          <p>Oturumunuzu yenileyip tekrar deneyin.</p>
          <button type="button" onClick={() => schoolsQuery.refetch()}>
            Tekrar dene
          </button>
        </div>
      </main>
    );
  }

  const adminSchools = schoolsQuery.data.filter((school) =>
    school.roles.includes("ADMIN"),
  );

  if (adminSchools.length === 1) {
    return <Navigate to={dashboardPath(adminSchools[0])} replace />;
  }

  if (adminSchools.length === 0) {
    return (
      <main className="school-selection-layout">
        <section className="selection-card no-admin-card">
          <div className="brand">AWay</div>
          <p className="eyebrow">YÖNETİM ALANI</p>
          <h1>Yönetici okul üyeliğiniz bulunmuyor.</h1>
          <p>
            Bu hesapla giriş yaptınız; ancak yönetim alanı yalnız aktif ADMIN
            rolüne sahip okulları gösterir.
          </p>
          <p className="signed-in-as">
            {user?.firstName} {user?.lastName}
          </p>
          <button
            type="button"
            onClick={() => {
              void signOut().finally(() =>
                navigate("/sign-in", { replace: true }),
              );
            }}
          >
            Çıkış yap
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="school-selection-layout">
      <section
        className="selection-card"
        aria-labelledby="school-selection-title"
      >
        <div className="brand">AWay</div>
        <p className="eyebrow">YÖNETİM ALANI</p>
        <h1 id="school-selection-title">Devam etmek için okul seçin.</h1>
        <p>Yalnız yöneticisi olduğunuz aktif okullar listelenir.</p>
        <div className="school-list">
          {adminSchools.map((school) => (
            <button
              key={school.id}
              className="school-choice"
              type="button"
              onClick={() => navigate(dashboardPath(school))}
            >
              <span>
                <strong>{school.name}</strong>
                <small>{school.code}</small>
              </span>
              <span aria-hidden="true">→</span>
            </button>
          ))}
        </div>
        <button
          className="text-button selection-sign-out"
          type="button"
          onClick={() => {
            void signOut().finally(() =>
              navigate("/sign-in", { replace: true }),
            );
          }}
        >
          Farklı hesapla giriş yap
        </button>
      </section>
    </main>
  );
}

function dashboardPath(school: SchoolSummary): string {
  return `/schools/${school.id}/dashboard`;
}
