# AWay — AI Agent Çalışma Kuralları

Bu dosya, AWay projesinde AI-assisted geliştirme yapan ajanların uyması gereken proje kurallarını içerir. Mevcut kod tabanı analiz edilerek oluşturulmuştur.

## 1. PROJE

- AWay bir **okul yoklama/attendance sistemidir**.
- Backend: **NestJS + TypeScript** (`services/api`).
- Database: **PostgreSQL 17** + **Prisma 7**.
- Cache / gelecek kullanım: **Redis 7** (docker-compose'da tanımlı, henüz uygulama kodunda kullanılmıyor).
- Monorepo: **pnpm workspace** (`pnpm-workspace.yaml` → `apps/*`, `services/*`, `packages/*`).
- Runtime: **Node.js >= 22.13** ve **pnpm 11.21.0**. Doğrulanmış geliştirme sürümü Node 22.23.2'dir; Node 20, bu pnpm sürümünü çalıştıramaz.
- Yardımcı paketler: `packages/validation` (`@away/validation`).
- Frontend app'leri: `apps/admin-web`, `apps/mobile` — **henüz scaffold edilmedi** (boş klasörler, `pnpm dev:web` çalışmaz). TODO/VERIFY: admin-web uygulaması scaffold edilene kadar `dev:web` kullanılmamalı.

## 2. MİMARİ KURALLAR

- Mevcut modüler NestJS yapısını koru. Her domain kendi `module/controller/service` yapısında ilerler (`src/<domain>/`).
- Prisma erişimi her zaman **`PrismaService`** üzerinden yapılır; doğrudan `PrismaClient` örneği oluşturma.
- **`PrismaService`'in mevcut Prisma 7 driver-adapter yaklaşımını bozma** (`@prisma/adapter-pg` + `PrismaPg`, `DATABASE_URL`'den).
- Ortak validation/utility kodları uygun olduğunda `packages/` altında tutulur (ör. `packages/validation`).
- Domainler arasında gereksiz doğrudan bağımlılık oluşturma; paylaşılan erişim için global `PrismaModule` kullanılabilir.
- Commitlenmiş baseline'da yalnızca `AuthModule`, `HealthModule` ve `PrismaModule` içerik doludur; diğer domain modülleri (Users, Schools, Memberships, Classes, Students, Parents, Attendance, LessonPeriods, Audit, SchoolAdminAssignments) boş iskelettir (`@Module({})`). Çalışma ağacındaki commitlenmemiş işleri ayrıca kontrol et.
- `JwtGuard` yalnızca kimlik doğrulamasıdır. Yeni domain endpointlerinde, ihtiyaca göre aktif `SchoolMembership`, rol ve okul/tenant kapsamı ayrıca doğrulanmalıdır. Bu kural, V1'de öğretmen için sabit sınıf veya ders ataması yapılacağı anlamına gelmez.
- Okul-kapsamlı endpointler `/schools/:schoolId/...` yolu altında tanımlanır ve `JwtGuard` ile `SchoolMembershipGuard` birlikte kullanılır. `SchoolMembershipGuard`, okulun aktifliğini ve isteği yapan kullanıcının aktif üyeliğini her istekte yeniden doğrular; izin verilen roller gerekiyorsa `@SchoolRoles(...)` ile açıkça belirtilir. İstemci `membershipId` seçmez veya yetki kanıtı olarak göndermez.

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
- Geliştirme ortamında OTP, `[DEV OTP]` logu olarak konsola basılabilir; gerçek SMS sağlayıcısı bağlanana kadar production'a taşınmamalıdır. Mevcut `AuthService` çıktısı ortam kontrolü olmadan logluyor; production'a çıkmadan önce açık bir environment guard ile sınırlandırılmalıdır.

## 5. DATABASE

- **Prisma schema tek source of truth'tur** (`services/api/prisma/schema.prisma`).
- Schema değişikliğinden sonra uygun **Prisma migration** oluşturulur.
- Geliştirme migration'ları **`prisma migrate dev`** ile oluşturulur (sürüm 7).
- **Mevcut migration geçmişini değiştirme veya silme** (şu an tek migration: `20260810204158_init`).
- Soft-delete kullanılan modellerde (`School`, `SchoolMembership`, `Class`, `Student`, `Parent`) mevcut **`deletedAt`** yaklaşımını koru.
- Prisma 7: schema'da `url` tanımı yok; bağlantı `PrismaService` içindeki driver-adapter üzerinden `DATABASE_URL`'den gelir. Generator `prisma-client`, output `../generated/prisma`, `moduleFormat = "cjs"`.
- Prisma CLI bağlantı/migration ayarını `services/api/prisma.config.ts` üzerinden alır. Derlenmiş `prisma.config.js`, `.map` ve `.d.ts` dosyaları kaynak değildir; repoya eklenmemeli ve Prisma CLI'ın config çözümlemesini gölgelememelidir.

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

## 12. V1 ÜRÜN VE İŞ KURALLARI

Bu bölüm hedef davranışı tanımlar; burada yazan her madde mevcut şema veya endpointler tarafından henüz uygulanmış değildir. Bir maddeyi uygulamadan önce mevcut modelin yeterliliğini incele, gerekiyorsa yeni migration ve test planı oluştur.

- AWay ilk günden **multi-tenant** tasarlanır. Bir okulun verisi başka okulun kullanıcısına görünmemeli veya değiştirilememelidir; `schoolId` tek başına güvenlik kontrolü sayılmaz.
- V1'in odağı yoklamadır. Bildirimler, özel/grup mesajlaşma, gerçek SMS/push, abonelik/faturalama, gelişmiş raporlar ve OCR tabanlı içe aktarma sonraki fazlardır.
- Şemadaki `MembershipRole.ADMIN`, V1'deki okul yöneticisi/süper admin rolüdür. Her okulda en az bir aktif admin kalmalı; son adminin devri/kaldırılması yeni admin ataması veya platform düzeyi kurtarma akışı olmadan mümkün olmamalıdır.
- Kimlik ve onboarding modelinde ayrı kayıt formu/parola yoktur. `User`, telefon numarasıyla tanımlanan global hesap kimliğidir; `SchoolMembership` okul içi yetkiyi, `Student` ve `Parent` okul-yerel iş profilini temsil eder. Okul yöneticisi kişinin adı, E.164 telefonu ve rolüyle onu önceden tanımlar; sunucu telefonla mevcut global `User`ı bulur veya doğrulanmamış olarak oluşturur ve ilgili okul üyeliğine/profiline bağlar. İstemciden `userId` kabul edilmez.
- İlk OTP eşleşmesi yalnız telefon üzerinden yapılır: `request-otp` kullanıcı oluşturmaz; yalnız önceden tanımlanmış ve en az bir aktif okul üyeliği bulunan E.164 telefonuna OTP üretir. İlk başarılı `verify-otp`, aynı global `User` için `phoneVerifiedAt` değerini set eder; bu hesabın sahiplenilme anıdır. OTP endpointleri `schoolId`, profil kimliği veya isim almaz. Aynı telefonun diğer okul/rol bilgileri, bir okul yöneticisine açığa çıkarılmaz.
- Aynı global kullanıcı farklı okullarda ve rollerle bulunabilir. Şemada bir kullanıcının her okulda en fazla bir öğrenci ve en fazla bir veli profili vardır; `Student` ve `Parent` ilişkileri okul kapsamlı benzersizlikle modellenir. Aynı telefonla iki ayrı kişi/hesap V1 kapsamı dışındadır; otomatik hesap birleştirme yapılmaz. Global telefon veya isim değişikliği platform destek/yüksek güvenlikli ayrı akıştır.
- Aynı hesap, telefon + OTP ile hem mobil uygulamadan hem web arayüzünden giriş yapabilir; istemci türüne göre ayrı `User`, profil veya üyelik oluşturulmaz. Birden çok cihaz/oturum desteklenir ve okul yetkisi her kanalda aynı aktif `SchoolMembership` kayıtlarından hesaplanır. Web'de refresh token production ortamında `HttpOnly`, `Secure`, uygun `SameSite` cookie ile; mobilde işletim sisteminin güvenli depolamasıyla taşınır. Access token kısa ömürlüdür; refresh token web `localStorage` veya `sessionStorage` içine yazılmaz. Mevcut body tabanlı refresh-token cevabı, web entegrasyonundan önce bu kurala uyarlanmalıdır.
- Aynı kullanıcı aynı okulda birden çok toplamsal role (`ADMIN` + `TEACHER`, `TEACHER` + `PARENT` gibi) sahip olabilir. Her `(schoolId, userId, role)` için tek mantıksal üyelik tutulur; rol kaldırma soft-delete, yeniden verme aynı üyeliği geri açma şeklindedir. Aktif `ADMIN` üyeliği V1'de yetkinin tek kaynağıdır; `SchoolAdminAssignment` yalnız atama/tarihçe kaydıdır. Son aktif adminin kaldırılması transaction içinde engellenir.
- V1'de öğretmen–ders veya öğretmen–sınıf sabit ataması yoktur. Nöbetçi dahil yetkili öğretmen yoklama gönderebilir; yine de gönderim yapan kullanıcının ilgili okulda aktif ve uygun rollü üyeliği doğrulanır.
- Yoklamada girilen öğrenci numaraları **devamsız** öğrencileri temsil eder; girilmeyen aktif öğrenciler mevcut kabul edilir. Öğrenci numarası okul genelinde benzersizdir; böylece sistem dolu devamsız listesinde numaralardan sınıfı bulabilir. Girilen numaralar kayıtlı, tekrarsız ve aynı sınıfta olmalıdır. Liste boşsa "herkes mevcut" yoklaması için istemci sınıfı açıkça belirtmelidir.
- Tüm V1 okulları için iş saat dilimi sabit olarak `Europe/Istanbul`'dur; tarih ve gün hesabı bu saat diliminde yapılır. Çoklu zaman dilimi desteği V1 dışındadır; bu nedenle henüz `School.timeZone` alanı eklenmez.
- İstemci sınıfı, tarihi ve ders numarasını verir; sunucu, seçilen tarihin İstanbul gününe karşılık gelen `SchoolLessonPeriod` kaydını (`schoolId`, `dayOfWeek`, `lessonNumber`) bulup doğrular. Kayıt yoksa istek, “Bu okul için <gün> günü <n>. ders saati tanımlı değil” hatasıyla reddedilir. Yoklama ders bittikten sonra girilebilir veya düzeltilebilir; yalnız gelecekteki tarih ve günlük kesinleşme sınırının gerisindeki tarih reddedilir. Ders saati tanımlarında `startMinute < endMinute` ve aynı gün çakışmama kuralları uygulanır; günler farklı sayıda ders içerebilir. Tatil/takvim yönetimi V1 dışındadır.
- Aynı okul, sınıf, tarih ve ders numarası için yalnız bir, kalıcı yoklama kaydı vardır; bu benzersizlik durumdan bağımsız korunur. V1'de normal bir “iptal et ve yerine yeni yoklama aç” akışı yoktur; kayıt silinmez ve slot serbest kalmaz. `AttendanceStatus` yalnız `SUBMITTED` ve `LOCKED` değerlerini taşır; eski `CANCELLED` kayıtları migration sırasında audit edilerek `LOCKED` durumuna dönüştürülmüştür.
- Yoklama iki ayrı kilit düzeyine sahiptir. Yönetici aynı gün içindeki kaydı **inceleme kilidine** alabilir; aktif, yetkili `TEACHER` veya `ADMIN` gerekçeli talep açarsa yönetici yalnız talep eden kişiye kısa süreli ve tek kullanımlık düzenleme izni verebilir. Bu izin yalnız kesinleşmemiş kayıt için geçerlidir. Talep, onay/red, önceki/sonraki devamsız listesi, aktörler ve zamanlar audit kaydında tutulur. V1'de yalnız devamsız öğrenci listesi değişir; sınıf, tarih ve ders numarası değiştirme yalnız zorunlu gerekçeli yönetici istisnasıdır.
- **Günlük kesinleşme** terminaldir: Bir okulda `D` tarihli ilk yoklama başarıyla gönderildiğinde, aynı transaction içinde o okulda `lessonDate < D` olan bütün mevcut yoklamalar kesinleşir. Kesinleşen yoklama admin dahil hiç kimse tarafından düzenlenemez, yeniden açılamaz veya silinemez; açık düzenleme izinleri/talepleri geçersizleşir. Uygulama, yalnız mevcut satırları kilitlemekle yetinmeyip okul düzeyinde kalıcı bir kesinleşme sınırı tutmalıdır; böylece kesinleşen geçmiş tarih için sonradan eksik bir yoklama da oluşturulamaz. Böyle eksik bir slot “yoklama alınmamış” olarak kalır; “herkes mevcut” anlamına gelmez. Bu sınır okul bazlıdır ve `Europe/Istanbul` iş tarihleriyle değerlendirilir.
- AWay, e-Okul'un yerine geçmez. Eğitim yılı veya resmî nakil/enrollment geçmişi tutulmaz; yönetici yalnız güncel öğrenci listesini ve sınıfını yönetir. Buna karşılık her yoklama ilk gönderimde o anki sınıf mevcudunun (öğrenci kimliği, numarası, adı ve mevcut/devamsız durumu) snapshot'ını saklar. Sonraki sınıf, numara veya ad değişiklikleri geçmiş yoklama görünümünü değiştirmez; düzeltmeler aynı snapshot üzerinde revizyon/audit ile yapılır. Geçmiş tarihli ilk kayıt, V1'de o anki roster'ı temsil eder; geçmişteki resmî sınıf listesini yeniden kurma ihtiyacı doğarsa ayrı `Enrollment` modeli sonraki fazda ele alınır. e-Okul'a aktarılan yoklama silinmez; aktarım zamanı ve revizyonu saklanır. Aktarımdan sonra bir düzeltme yapılırsa kayıt “e-Okul güncellemesi gerekli” olarak işaretlenir.
- Bir öğrenci birden fazla veliye, bir veli de birden fazla öğrenciye bağlanabilir. Mevcut `ParentStudent` ilişkisinin many-to-many yapısı korunur.
- Toplu öğrenci/veli/öğretmen içe aktarma, çekirdek yoklama akışından sonra ele alınır. Uygulandığında akış parse → doğrulama → önizleme → yönetici onayı → atomik transaction olmalıdır; Excel/CSV/ODS önceliklidir, PDF/fotoğraf OCR daha sonraki aşamadır.

## 13. AJAN ÇALIŞMA ONAYI

- Görev kapsamındaki normal dosya düzenleme, terminal komutu, migration, test verisi oluşturma/temizleme ve doğrulama işlemleri için ajanın kullanıcıdan ayrıca interaktif onay istemesi gerekmez.
- Bu çalışma kuralı, AWay uygulamasındaki kullanıcı authentication/authorization kurallarını gevşetmez veya kaldırmaz.

---

## Current Project Status

- **Backend (`services/api`)**: NestJS 11 temeli build alıyor. Auth, Health, global Prisma, `GET /users/me`, `GET /users/me/schools` ve okul-kapsamlı `GET /schools/:schoolId/context` çalışır. Son iki endpoint, aktif üyelik tabanlı tenant kontrolünün referans uygulamasıdır.
- **Auth akışı**: `request-otp` → OTP hash ile saklanır (5 dk geçerli) → `verify-otp` → JWT access token döner. `JwtGuard` kullanıcıyı doğrular; okul-kapsamlı endpointlerde buna ek olarak `SchoolMembershipGuard` gerekir. Web için cookie tabanlı refresh akışı henüz uygulanmamıştır.
- **Prisma 7**: Driver-adapter (`@prisma/adapter-pg`) yaklaşımı ile `generated/prisma` üzerinden kullanılıyor. `init` ve `20260813151001_attendance_foundation` olmak üzere iki migration vardır; ikincisi çok-okul profil ilişkilerini, yoklama snapshot/kilit/düzenleme talebi modelini ve okul bazlı kesinleşme sınırını ekler.
- **Domain modülleri**: Users ve Schools yukarıdaki küçük dikey dilimlerle içeriklidir. Memberships, SchoolAdminAssignments, Classes, Students, Parents, Attendance, LessonPeriods ve Audit henüz endpoint/servis olarak boş iskeletlerdir.
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
| Prisma client üret | `pnpm --dir services/api exec prisma generate` |
| Dev migration | `pnpm --dir services/api exec prisma migrate dev` |
| Prisma Studio | `pnpm --dir services/api exec prisma studio` |

Not: Bu komutlar Node >= 22.13 gerektirir. API `build` çıktısı `dist/src/...` düzenindedir; `start:prod` = `node dist/src/main`. Port `PORT` env'den (varsayılan 3000). Health: `GET /health`.

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
