# AGENTS.md

## Workspace
- This repo is 3 separate projects, not a workspace. Run commands inside `frontend/`, `backend/`, or `android/`; the root only holds docs, `railway.json`, and a stray `package-lock.json`.
- Ignore generated/local outputs when searching: `frontend/.next/`, `frontend/node_modules/`, `backend/target/`, `android/build/`, `backend/server.log`.

## Frontend
- `frontend/` is a Next 16 App Router app.
- UI copy goes through the custom client i18n layer in `frontend/lib/i18n/index.tsx`; add new keys across `es/en/fr/pt/de/it.ts`. This is not Next locale routing.
- Tailwind scans both `frontend/componentes/**` and `frontend/components/**`. `componentes/` holds app code; `components/` holds shadcn/ui primitives.
- Driver route start/navigation pages are thin re-exports; change `frontend/componentes/ConductorRutaInicioPage.tsx`, not `app/conductor/iniciar/[rutaId]/page.tsx` or `app/conductor/navegacion/[rutaId]/page.tsx`.
- Most client code uses `NEXT_PUBLIC_API_URL`, but any relative `/api/*` request is rewritten by `frontend/next.config.ts` to the production Railway backend. `app/login/page.tsx`, `app/register/page.tsx`, and `app/conductor/login/page.tsx` use that path for Google auth, so those flows are not local by default.
- `frontend/middleware.ts` is a global WAF/rate limiter on almost all routes. Unexpected `403`/`429` responses or blocked auth flows can come from middleware before the backend.
- Verified commands: `npm run dev`, `npx tsc --noEmit`, `npm run lint`.
- `npm run lint` is not a clean baseline right now; it reports existing repo-wide errors/warnings (for example `no-explicit-any`, hook dependency warnings, and utility scripts using `require`). Use targeted ESLint on touched files when you need signal.

## Backend
- Source-of-truth config is `backend/src/main/resources/application.properties`; `backend/application.properties` is a stale duplicate.
- Spring auth is multi-tenant in a non-obvious way: request attribute `userId` means tenant/company id. Admin JWT subject = admin id; conductor JWT subject = `empresaId` plus separate `conductorId` claim (`JwtUtil`, `JwtFilter`). Do not treat `userId` as the human user everywhere.
- `JwtFilter` intentionally exempts Android telemetry routes from auth: `POST /api/rutas/{id}/gps`, `GET /api/rutas/{id}/last-location`, `POST /api/rutas/{id}/request-gps`.
- CORS is hardcoded in `backend/src/main/java/com/ecofleet/config/WebConfig.java` (`localhost`, `10.0.2.2`, `*.vercel.app`, production Vercel host). The documented `CORS_ORIGINS` property is not wired into code.
- Runtime env from code: `SPRING_DATA_MONGODB_URI`, `JWT_SECRET`, `RESEND_API_KEY`, optional `RESEND_FROM_EMAIL`. `README.md` and `RAILWAY_ENV.md` still mention `MONGO_URI` and Gmail app passwords; those are stale.
- Root `railway.json` deploys the frontend only (`rootDirectory: frontend`). Backend deployment logic lives in `backend/Dockerfile`.
- There is no Maven wrapper. Use system Maven: `mvn spring-boot:run`, `mvn test`, `mvn -Dtest=AlertaServiceTest test`, `mvn -Dtest=ReporteServiceTest test`.

## Android
- `android/` is a WebView shell over the deployed frontend, not a separate native UI. `MainActivity` loads `BuildConfig.WEB_URL + "/conductor/login"` and exposes the `AndroidTracker` JS bridge; `TrackingService` posts GPS directly to the backend.
- Frontend URL, backend URL, and Google client id are hardcoded as `buildConfigField`s in `android/app/build.gradle`. Local/OAuth/domain changes require updating Android and frontend together; `frontend/app/conductor/login/page.tsx` also hardcodes the Google redirect URI.
- Release signing expects local `android/keystore.properties` (see `android/keystore.properties.example`).

## Verification
- No frontend test script, Android test suite, CI workflow, or pre-commit config was found.
- Backend tests live in `backend/src/test/java/com/ecofleet/service/`; they are mock-based unit tests and do not need MongoDB.
