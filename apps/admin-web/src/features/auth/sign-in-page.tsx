import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { ApiError } from "../../lib/api";
import { requestOtp, verifyWebOtp } from "./auth-api";
import { useAuth } from "./auth-context";

const OTP_LENGTH = 6;

export function SignInPage() {
  const navigate = useNavigate();
  const { isRestoring, startSession, user } = useAuth();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (isRestoring) {
    return (
      <main className="loading-screen" aria-live="polite">
        <div className="loading-mark" aria-hidden="true" />
        <p>Oturumunuz doğrulanıyor…</p>
      </main>
    );
  }

  if (user) {
    return <Navigate to="/select-school" replace />;
  }

  async function submitPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      await requestOtp(phone);
      setStep("code");
      setMessage("Kod gönderildiyse 5 dakika içinde geçerlidir.");
    } catch (requestError: unknown) {
      setError(errorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!/^\d{6}$/.test(code)) {
      setError("Doğrulama kodu 6 haneli olmalıdır.");
      return;
    }

    setIsSubmitting(true);

    try {
      startSession(await verifyWebOtp(phone, code));
      navigate("/select-school", { replace: true });
    } catch (requestError: unknown) {
      setError(errorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-intro" aria-label="AWay hakkında">
        <div className="brand">AWay</div>
        <div className="auth-intro-copy">
          <p className="eyebrow">OKUL YÖNETİMİ</p>
          <h1>Yoklama sürecini tek, güvenilir kayıtta yönetin.</h1>
          <p>
            Sınıflar, öğrenciler, ders saatleri ve günlük yoklama takibi için
            yönetim alanınız.
          </p>
        </div>
        <div className="intro-note">
          <span className="status-dot" aria-hidden="true" />
          Türkiye saat dilimi · Güvenli telefon doğrulaması
        </div>
      </section>

      <section className="auth-panel" aria-labelledby="sign-in-title">
        <div className="auth-card">
          <div className="brand mobile-brand">AWay</div>
          <p className="eyebrow">YÖNETİM ALANI</p>
          <h2 id="sign-in-title">
            {step === "phone"
              ? "Telefon numaranızla giriş yapın"
              : "Doğrulama kodunu girin"}
          </h2>
          <p className="muted">
            {step === "phone"
              ? "Sistemde tanımlı telefon numaranıza tek kullanımlık kod gönderilir."
              : `${phone} numarasına gönderilen 6 haneli kodu yazın.`}
          </p>

          {step === "phone" ? (
            <form className="auth-form" onSubmit={submitPhone}>
              <label htmlFor="phone">Telefon numarası</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="05xx xxx xx xx"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
                disabled={isSubmitting}
              />
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Kod isteniyor…" : "Doğrulama kodu iste"}
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={submitCode}>
              <label htmlFor="code">Doğrulama kodu</label>
              <input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={OTP_LENGTH}
                placeholder="000000"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, ""))
                }
                required
                disabled={isSubmitting}
              />
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Doğrulanıyor…" : "Güvenli giriş yap"}
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setStep("phone");
                  setCode("");
                  setError("");
                  setMessage("");
                }}
                disabled={isSubmitting}
              >
                Telefon numarasını değiştir
              </button>
            </form>
          )}

          {message ? <p className="form-message success">{message}</p> : null}
          {error ? <p className="form-message error">{error}</p> : null}
          <p className="form-footnote">
            Sistem, telefon numaranızın kayıtlı olup olmadığını paylaşmaz.
          </p>
        </div>
      </section>
    </main>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Bağlantı kurulamadı. Lütfen tekrar deneyin.";
}
