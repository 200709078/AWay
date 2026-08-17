import { NavLink, useOutletContext } from "react-router";
import type { SchoolShellContext } from "./app-shell";

export function HomePage() {
  const { school } = useOutletContext<SchoolShellContext>();
  const today = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(new Date());

  return (
    <main className="dashboard" id="today">
      <section className="dashboard-heading">
        <p className="eyebrow">{today}</p>
        <h1>{school.school.name}</h1>
        <p>
          Yoklama altyapısı hazırlandıkça günün sınıf ve ders saati durumu
          burada görünür.
        </p>
      </section>

      <section className="setup-grid" aria-label="İlk kurulum adımları">
        <article className="setup-card current">
          <span className="step-number">01</span>
          <div>
            <h2>Okul erişimi doğrulandı</h2>
            <p>Aktif ADMIN üyeliğiniz güvenli oturumunuzla eşleştirildi.</p>
          </div>
          <span className="card-status">Hazır</span>
        </article>
        <article className="setup-card current">
          <span className="step-number">02</span>
          <div>
            <h2>Sınıfları ekleyin</h2>
            <p>İlk öğrenci ve yoklama işlemlerinden önce sınıf listenizi oluşturun.</p>
          </div>
          <NavLink
            className="card-status card-link"
            to={`/schools/${school.school.id}/classes`}
          >
            Aç
          </NavLink>
        </article>
        <article className="setup-card current">
          <span className="step-number">03</span>
          <div>
            <h2>Öğrencileri ekleyin</h2>
            <p>Güncel sınıf mevcudunu oluşturun; giriş hesabını isteğe bağlı hazırlayın.</p>
          </div>
          <NavLink
            className="card-status card-link"
            to={`/schools/${school.school.id}/students`}
          >
            Aç
          </NavLink>
        </article>
        <article className="setup-card current">
          <span className="step-number">04</span>
          <div>
            <h2>Öğretmenleri tanımlayın</h2>
            <p>
              Yoklama alacak öğretmenleri telefonlarıyla önceden tanımlayın;
              ilk girişlerini OTP ile kendileri doğrular.
            </p>
          </div>
          <NavLink
            className="card-status card-link"
            to={`/schools/${school.school.id}/teachers`}
          >
            Aç
          </NavLink>
        </article>
        <article className="setup-card current">
          <span className="step-number">05</span>
          <div>
            <h2>Ders saatlerini tanımlayın</h2>
            <p>
              Yoklamanın gün ve ders numarasına göre doğrulanması için haftalık
              saat çizelgesini oluşturun.
            </p>
          </div>
          <NavLink
            className="card-status card-link"
            to={`/schools/${school.school.id}/lesson-periods`}
          >
            Aç
          </NavLink>
        </article>
        <article className="setup-card current">
          <span className="step-number">06</span>
          <div>
            <h2>Günlük yoklamayı yönetin</h2>
            <p>
              Sınıf ve ders saati bazında yoklama alın; inceleme kilidi ve
              düzeltme taleplerini tek panodan takip edin.
            </p>
          </div>
          <NavLink
            className="card-status card-link"
            to={`/schools/${school.school.id}/attendances`}
          >
            Aç
          </NavLink>
        </article>
      </section>

      <section className="attendance-preview" id="attendance">
        <div>
          <p className="eyebrow">BUGÜNÜN YOKLAMALARI</p>
          <h2>Yoklama takip merkezi hazır.</h2>
          <p>
            Tekil yoklama, inceleme kilidi, düzeltme talebi ve günlük kesinleşme
            durumlarını gün bazında takip edin.
          </p>
        </div>
        <NavLink
          className="secondary-action"
          to={`/schools/${school.school.id}/attendances`}
        >
          Yoklama panosunu aç
        </NavLink>
      </section>
    </main>
  );
}
