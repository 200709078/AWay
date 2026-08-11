# AWay — AI Agent Çalışma Kuralları

Bu dosya, AWay projesinde AI-assisted geliştirme yapan ajanların uyması gereken proje kurallarını içerir. Mevcut kod tabanı analiz edilerek oluşturulmuştur.

## 1. PROJE

- AWay bir **okul yoklama/attendance sistemidir**.
- Backend: **NestJS + TypeScript** (`services/api`).
- Database: **PostgreSQL 17** + **Prisma 7**.
- Cache / gelecek kullanım: **Redis 7** (docker-compose'da tanımlı, henüz uygulama kodunda kullanılmıyor).
- Monorepo: **pnpm workspace** (`pnpm-workspace.yaml` → `apps/*`, `services/*`, `packages/*`).
- Yardımcı paketler: `packages/validation` (`@away/validation`).
- Frontend app'leri: `apps/admin-web`, `apps/mobile` — **henüz scaffold edilmedi** (boş klasörler, `pnpm dev:web` çalışmaz). TODO/VERIFY: admin-web uygulaması scaffold edilene kadar `dev:web` kullanılmamalı.

## 2. MİMARİ KURALLAR

- Mevcut modüler NestJS yapısını koru. Her domain kendi `module/controller/service` yapısında ilerler (`src/<domain>/`).
- Prisma erişimi her zaman **`PrismaService`** üzerinden yapılır; doğrudan `PrismaClient` örneği oluşturma.
- **`PrismaService`'in mevcut Prisma 7 driver-adapter yaklaşımını bozma** (`@prisma/adapter-pg` + `PrismaPg`, `DATABASE_URL`'den).
- Ortak validation/utility kodları uygun olduğunda `packages/` altında tutulur (ör. `packages/validation`).
- Domainler arasında gereksiz doğrudan bağımlılık oluşturma; paylaşılan erişim için global `PrismaModule` kullanılabilir.
- Şu an yalnızca `AuthModule`, `HealthModule` ve `PrismaModule` içerik dolu; diğer domain modülleri (Users, Schools, Memberships, Classes, Students, Parents, Attendance, LessonPeriods, Audit, SchoolAdminAssignments) boş iskelettir (`@Module({})`).

## 3. TELEFON NUMARALARI

- Sistem telefon numaralarını **E.164 formatında** saklar. Türkiye için örnek: `+905551234567`.
- Kullanıcı girdileri `@away/validation` paketindeki **`normalizePhone(value, defaultCountry='TR')`** üzerinden normalize edilmelidir.
- Normalize sırasında hata fırlatılır; çağıran taraf `BadRequestException` gibi uygun şekilde yakalamalıdır.
- Veritabanında normalize edilmemiş telefon numarası saklanmaz. `User.phone` `@unique` olup E.164 bekler.
- `isValidE164Phone` mevcut helper olarak da kullanılabilir.

## 4. AUTHENTICATION

- OTP tabanlı giriş kullanılır (`POST /auth/request-otp`, `POST /auth/verify-otp`).
- **OTP plaintext olarak veritabanında saklanmaz**; `OtpCode.codeHash` alanında **sha256 hash** saklanır.
- OTP **sürelidir** (şu an 5 dk) ve **tek kullanımlıktır** (başarılı doğrulamada `consumedAt` set edilir; geçersiz denemeler `attempts` artırır).
- Başarılı OTP doğrulamasından sonra **JWT access token** üretilir (`@nestjs/jwt`, payload: `sub`, `phone`).
- Korumalı endpointlerde **`JwtGuard`** kullanılmalıdır (`src/auth/guards/jwt/jwt.guard.ts`). Guard kullanıcıyı DB'den yükler ve `request.user`'a atar.
- Authentication mantığı domain servislerine dağıtılmaz; `AuthModule`/`AuthService` içinde kalır.
- `JWT_ACCESS_SECRET` environment değişkeninden okunur.
- Access token süresi `JWT_ACCESS_EXPIRES_IN` environment değişkeninden okunur; tanımlı değilse `15m` kullanılır.
- `RefreshSession` modeli ve refresh token akışı implement edilmiştir.
- Refresh token imzalama için `JWT_REFRESH_SECRET` kullanılır.
- Refresh token süresi `JWT_REFRESH_EXPIRES_IN` environment değişkeninden okunur; tanımlı değilse `30d` kullanılır.
- Refresh token plaintext olarak veritabanında saklanmaz; token'ın SHA-256 hash'i `RefreshSession.tokenHash` alanında tutulur.
- Refresh işlemi sırasında mevcut session revoke edilir ve yeni access/refresh token çifti oluşturulur.
- Dev ortamında OTP, `[DEV OTP]` logu olarak konsola basılır (`AuthService` içindeki TODO); gerçek SMS sağlayıcısı bağlanana kadar korunmalı, production'a taşınmamalıdır.

## 5. DATABASE

- **Prisma schema tek source of truth'tur** (`services/api/prisma/schema.prisma`).
- Schema değişikliğinden sonra uygun **Prisma migration** oluşturulur.
- Geliştirme migration'ları **`prisma migrate dev`** ile oluşturulur (sürüm 7).
- **Mevcut migration geçmişini değiştirme veya silme** (şu an tek migration: `20260810204158_init`).
- Soft-delete kullanılan modellerde (`School`, `SchoolMembership`, `Class`, `Student`, `Parent`) mevcut **`deletedAt`** yaklaşımını koru.
- Prisma 7: schema'da `url` tanımı yok; bağlantı `PrismaService` içindeki driver-adapter üzerinden `DATABASE_URL`'den gelir. Generator `prisma-client`, output `../generated/prisma`, `moduleFormat = "cjs"`.

## 6. KOD DEĞİŞİKLİĞİ

- Bir görevi tamamlamak için **minimum dosyayı** değiştir.
- Çalışan kodu gereksiz yere yeniden yazma.
- API contractlarını gereksiz yere değiştirme.
- Yeni dependency eklemeden önce gerçekten gerekli olup olmadığını değerlendir.

## 7. TEST / DOĞRULAMA

Kod değişikliğinden sonra mümkün olduğunda şu komutları çalıştır:

```
pnpm --filter @away/api build
pnpm --filter @away/validation exec tsc --noEmit
```

İlgili endpointler için uygun curl/API testleri yap. Örnek akış:
- `POST /auth/request-otp` (body: `{ "phone": "..." }`)
- `POST /auth/verify-otp` (body: `{ "phone": "...", "code": "..." }` — dev ortamında kod konsol logundan alınır)
- `GET /health`

## 8. DOSYA DÜZENİ

Mevcut workspace yapısını koru:

```
apps/          # admin-web, mobile (henüz boş)
services/api/  # NestJS backend
packages/      # validation vb. ortak paketler
infrastructure/ # docker vb. (henüz boş; docker-compose.yml repo kökünde)
docker-compose.yml
```

## 9. GÜVENLİK

- Secret, JWT secret, `DATABASE_URL` veya OTP gibi hassas bilgileri **source code içine yazma**.
- `.env` dosyasını commit etme (`.gitignore`'da `.env`/`.env.*` yok sayılıyor; `.env.example` hariç).
- OTP ve authentication bilgilerinin loglanmasını production için güvenli tut (dev OTP logu prod'da kaldırılmalı).
- Kullanıcı verilerini gereksiz yere response içinde döndürme.

# 10. HEDEF MİMARİ VE DOSYA YERLEŞİM KURALLARI

- Yeni backend domain kodları `services/api/src/<domain>/` altında tutulur.
- Her backend domaini mümkün olduğunda kendi `module`, `controller` ve `service` yapısına sahip olur.
- Domainler arasında ortak kullanılan backend yardımcı kodları `services/api/src/common/` altında tutulur.
- Environment ve uygulama configuration kodları `services/api/src/config/` altında tutulur.
- Prisma ve veritabanı erişim kodları `services/api/src/database/` altında tutulur.
- Authentication ile ilgili kodlar `services/api/src/auth/` altında tutulur.
- Ortak telefon, validation ve benzeri tekrar kullanılabilir kodlar `packages/validation/` altında tutulur.
- Birden fazla uygulama veya servis tarafından paylaşılacak TypeScript tipleri `packages/types/` altında tutulur.
- Birden fazla uygulama veya servis tarafından paylaşılacak configuration kodları `packages/config/` altında tutulur.
- Admin web uygulamasına ait kodlar `apps/admin-web/` altında tutulur.
- Mobil uygulamaya ait kodlar `apps/mobile/` altında tutulur.
- Docker ve diğer infrastructure dosyaları `infrastructure/` altında tutulur.
- Root seviyesindeki dosyalar yalnızca workspace, repository veya tüm projeyi ilgilendiren yapılandırmalar için kullanılır.
- Yeni bir dosya veya modül eklenmeden önce mevcut klasör yapısı ve bu yerleşim kuralları kontrol edilir.
- Aynı sorumluluk için yeni ve paralel bir klasör yapısı oluşturulmaz; mevcut mimari tercih edilir.
- Bir kodun hangi katmana ait olduğu belirsizse, yeni klasör oluşturmak yerine mevcut mimari incelenir ve uygun yer belirlenir.
- Yeni bir domain mevcut domain klasörlerinden biriyle aynı sorumluluğa sahipse yeni domain oluşturulmaz; mevcut domain genişletilir.
- Domainler arası ortaklaşan kod, ilgili domainlerden birinin içine taşınmak yerine uygun ortak katmana alınır.
- `packages/` altındaki ortak paketler yalnızca gerçekten birden fazla uygulama/servis tarafından paylaşılması gereken kodlar için kullanılır.
- Henüz oluşturulmamış hedef klasörler (`packages/types`, `packages/config`, `services/api/src/config` vb.) ihtiyaç ortaya çıkmadan fiziksel olarak oluşturulmaz.
- Yeni bir klasör oluşturulması gerekiyorsa klasörün amacı ve mimari katmanı mevcut proje yapısıyla tutarlı olmalıdır.
- Mevcut çalışan mimari, kullanıcı tarafından açıkça istenmedikçe yeni bir mimariyle değiştirilmez.

## 11. GELİŞTİRME PRENSİBİ

1. Önce mevcut kodu oku ve mevcut mimariyi anla.
2. Sonra değişiklik planını oluştur.
3. Sonra kodu değiştir.
4. Değişiklikten sonra build/typecheck/test yap.
5. Hata varsa düzelt ve tekrar doğrula.

---

## Current Project Status

- **Backend (`services/api`)**: NestJS 11 temeli kurulu ve build alıyor. Yalnızca `Auth` (OTP giriş + JWT), `Health` ve global `Prisma` modülleri işlevsel.
- **Auth akışı**: `request-otp` → OTP hash ile saklanır (5 dk geçerli) → `verify-otp` → JWT access token döner. `JwtGuard` mevcut; korumalı endpoint'lerde kullanılabilir.
- **Prisma 7**: Driver-adapter (`@prisma/adapter-pg`) yaklaşımı ile `generated/prisma` üzerinden kullanılıyor. Tek migration (`init`) mevcut.
- **Domain modülleri**: Users, Schools, Memberships, SchoolAdminAssignments, Classes, Students, Parents, Attendance, LessonPeriods, Audit — **boş iskelet**. Geliştirme burada devam edecek.
- **Refresh token akışı**: `RefreshSession` modeli ve `/auth/refresh` endpoint'i implement edilmiştir. Refresh token hash'i veritabanında tutulur ve token rotation uygulanır.
- **Redis**: compose'da tanımlı, uygulamada kullanılmıyor (cache için planlı).
- **Frontend**: `apps/admin-web` ve `apps/mobile` boş. `pnpm dev:web` çalışmaz. TODO.
- **Infrastructure**: `infrastructure/docker` boş; servisler repo kökündeki `docker-compose.yml` ile ayağa kalkar.

## Development Commands

| Amaç | Komut |
|---|---|
| Dev DB (PostgreSQL + Redis) | `docker compose up -d` |
| API geliştirme modu | `pnpm dev:api` (veya root'ta `pnpm dev`) |
| API build | `pnpm --filter @away/api build` |
| API lint | `pnpm --filter @away/api lint` |
| API test | `pnpm --filter @away/api test` |
| API E2E test | `pnpm --filter @away/api test:e2e` |
| Validation typecheck | `pnpm --filter @away/validation exec tsc --noEmit` |
| Validation build | `pnpm --filter @away/validation build` |
| Prisma client üret | `pnpm --filter @away/api exec prisma generate` |
| Dev migration | `pnpm --filter @away/api exec prisma migrate dev` |
| Prisma Studio | `pnpm --filter @away/api exec prisma studio` |

Not: API `build` çıktısı `dist/src/...` düzenindedir; `start:prod` = `node dist/src/main`. Port `PORT` env'den (varsayılan 3000). Health: `GET /health`.

## Important Architectural Decisions

- **Modüler NestJS**: her domain kendi modülünde; paylaşılan DB erişimi için global `PrismaModule`/`PrismaService`.
- **Prisma 7 driver-adapter**: PrismaClient, `PrismaPg` adapter'ı ile `DATABASE_URL` üzerinden bağlanır; schema'da `url` yok. Bu yaklaşım korunmalı.
- **E.164 telefon depolama**: tüm telefonlar `normalizePhone` ile normalize edilip saklanır; `User.phone` unique.
- **OTP güvenliği**: OTP yalnızca sha256 hash olarak saklanır; süreli (`expiresAt`), tek kullanımlık (`consumedAt`), deneme sayacı (`attempts`).
- **JWT access token**: OTP doğrulaması sonrası `sub`+`phone` payload'lı token; `JwtGuard` Bearer token doğrular ve kullanıcıyı DB'den yükleyip `request.user`'a atar.
- **Soft-delete**: `deletedAt` sütunu; ilgili modellerde filtreleme bunu dikkate almalı.
- **Monorepo**: pnpm workspace; `packages/validation` API tarafından `workspace:*` ile tüketiliyor.
- **Enum kullanımı**: `SchoolStatus`, `MembershipRole`, `AttendanceStatus`, `DayOfWeek` şemada enum olarak tanımlı; string literal karşılaştırmalarına tercih edilir.

## Rules for AI Coding Agents

1. Bu dosyadaki kurallara uy; önce mevcut kodu oku.
2. Minimum dosya değişikliği yap; gereksiz refactor/rewrite yapma.
3. Git işlemlerini kullanıcı istemedikçe yapma.
4. Kod değişikliğinden sonra `pnpm --filter @away/api build` ve `pnpm --filter @away/validation exec tsc --noEmit` ile doğrula.
5. Emin olmadığın veya doğrulanamayan bilgileri gerçekmiş gibi yazma; `TODO`/`VERIFY` olarak işaretle.
6. Secret/environment değerlerini kod içine ya da commit'e asla koyma.
7. Domainler arası gereksiz bağımlılık kurma; ortak yardımcıları `packages/` altında tut.
