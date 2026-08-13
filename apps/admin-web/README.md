# AWay yönetici web'i

React + Vite + TypeScript yönetim arayüzü.

## Geliştirme

API'yi ayrı terminalde başlatın:

```bash
pnpm dev:api
```

Ardından web uygulamasını başlatın:

```bash
pnpm dev:web
```

Yerelde Vite, `/auth`, `/users`, `/schools` ve `/health` isteklerini varsayılan
olarak `http://localhost:3000` API'sine proxy'ler. Böylece web refresh cookie'si
tarayıcı JavaScript'ine açılmadan aynı-origin akışında kalır. Farklı bir yerel API
adresi gerekirse `AWAY_API_PROXY_TARGET` kullanın; dağıtılmış uygulamada
`VITE_API_URL` açık API origin'i olmalıdır.

```bash
pnpm --filter @away/admin-web build
pnpm --filter @away/admin-web lint
```
