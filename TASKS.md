# We HR — Implementation Progress & Verification Checklist (`TASKS.md`)

## Phase 1 — Project Foundation
- [x] Inspect workspace directory, installed tools, and environment capabilities.
- [x] Initialize Git repository, `.gitignore`, `.env.example`, and `package.json`.
- [x] Design and implement 16-table multi-tenant database schema (`companies`, `subscription_plans`, `company_subscriptions`, `payment_records`, `branches`, `departments`, `work_shifts`, `workplaces`, `users`, `employees`, `approved_devices`, `attendance_records`, `attendance_events`, `attendance_corrections`, `leave_requests`, `holidays`, `audit_logs`).
- [x] Provide production PostgreSQL + Supabase Row Level Security (RLS) migration (`supabase/migrations/001_we_hr_schema_and_rls.sql`).
- [x] Implement local zero-cost relational SQLite engine (`backend/src/db/database.js`) using Node.js 24 native `node:sqlite`.
- [x] Implement cryptographic authentication (`scrypt` + `timingSafeEqual` password hashing, `HMAC-SHA256` JWT sessions, account deactivation token revocation).
- [x] Implement 6-role RBAC (`platform_super_admin`, `company_owner`, `hr_admin`, `branch_manager`, `supervisor`, `employee`) with server-side tenant isolation.

## Phase 2 — Core Attendance MVP
- [x] Implement server-side Haversine geospatial distance calculation (`calculateHaversineDistanceMeters`).
- [x] Enforce coordinate bounds, GPS accuracy threshold, location timestamp freshness, and mock-location rejection.
- [x] Implement strict biometric modality evaluation distinguishing true biometric verification (`biometric_strong`) from generic device unlock (`device_credential` PIN/pattern) and HR-approved biometric exceptions (`exception_fallback`).
- [x] Implement anti-buddy-punching device binding & shared-device detection (`approved_devices`).
- [x] Implement duplicate-submission protection via per-tenant `idempotency_key` uniqueness.
- [x] Implement offline pending attendance workflow (`pending` -> `needs_review` / `accepted` / `rejected` with 24h expiration check).
- [x] Build complete Flutter mobile application source code (`mobile_flutter/`) for Android & iOS (`local_auth`, `geolocator`, `flutter_secure_storage`).

## Phase 3 — HR Administration & Localization
- [x] Build responsive bilingual Web Administration Dashboard (`web/`) with full Arabic (`dir="rtl"`) and English (`dir="ltr"`) localization.
- [x] Implement regular day shifts and overnight cross-midnight shifts (`22:00 - 06:00`), grace periods, late arrival, early departure, and overtime calculations.
- [x] Implement immutable raw `attendance_events` with database-level `BEFORE UPDATE / DELETE` triggers and separate audited `attendance_corrections` ledger.
- [x] Implement Leave Requests, Holidays, Approved Devices management, CSV employee import, and Excel-compatible UTF-8 BOM CSV attendance export.

## Phase 4 — Commercial & Subscription Model
- [x] Implement subscription plans (`STARTER`, `GROWTH`, `ENTERPRISE`), expiry dates, grace periods, and backend enforcement of plan employee limits.
- [x] Implement manual payment submission & platform admin verification workflow (InstaPay, Bank Transfer, Fawry, SADAD references) without storing card numbers.

## Phase 5 — Testing, Hardening & Remaining Owner Actions
- [x] Implement and run 12 automated unit, integration, and HTTP E2E test suites (`npm test` — 12/12 passing).
- [x] Install Flutter 3.47.9, OpenJDK 17 and Android SDK (platform 36, build-tools 36, NDK 28.2) and complete the Android/iOS project scaffolding (`flutter create`, package `cloud.wehr.mobile`).
- [x] Build pilot release APK (`mobile_flutter/build/app/outputs/flutter-apk/app-release.apk`, 49.3 MB) — `flutter analyze` clean, `flutter test` passing. Built with `--dart-define=WE_HR_API_URL=http://192.168.1.7:3000 -P weHrAllowCleartext=true` (plain HTTP to the laptop backend; signed with the debug key).
- [x] Code hosted in private GitHub repo `yaminakkady/we-hr`.
- [x] Backend + web dashboard live at https://we-hr.onrender.com (Render free web service, Frankfurt; `NODE_ENV=production`, `HOST=0.0.0.0`, `TRUST_PROXY=true`, Render-generated `JWT_SECRET`). Free plan: sleeps after 15 min idle, SQLite resets to demo data on every restart/deploy.
- [x] APK rebuilt against the HTTPS server (`--dart-define=WE_HR_API_URL=https://we-hr.onrender.com`, cleartext disabled).
- [x] Platform Admin Console at `/admin` (`web/admin.*`, `backend/src/services/admin_service.js`, `/api/admin/*`): companies & subscriptions, login accounts & roles (create, change role/branch, reset password, enable/disable, force sign-out), branches, workplaces (with "use my location"), shifts, devices, payments, audit log. Platform-admin only; self-lockout and last-admin guards; every change audited; covered by `backend/tests/admin_api.test.js`.
- [x] Owner platform admins `ezz` / `nakkady` (seed password from `SEED_ADMIN_PASSWORD`, default `123456`); platform admins hidden from the public demo-accounts list.
- [x] One web app for website + APK. Routes: `/` unified sign-in + employee attendance (`web/home.*`), `/hr` HR dashboard (`web/index.html`), `/admin` admin console. The APK is a thin shell (`mobile_flutter/lib/main.dart`) that opens the website and answers native calls through `WeHrNative` (`web/native-bridge.js` ↔ `mobile_flutter/lib/services/native_bridge.dart`): `locate` (GPS + mock detection), `biometric` (OS fingerprint/Face ID via local_auth), `device`.
  - **Update flow:** push to `main` → Render redeploys → website and APK both show the change on next open. A new APK is only needed when the native bridge itself changes (new phone capability), or for the app icon/name/permissions.
  - All website and APK versions are kept in `releases/` (`apk/`, `web/`, index in `releases/README.md`); the built files are gitignored. App version is set in `mobile_flutter/pubspec.yaml` (v2.0 = `2.0.0+6`, v2.1 = `2.1.0+7`).
  - Browser check-ins use the device authenticator (WebAuthn: fingerprint / Windows Hello) but are reported as `device_credential`, so companies with strict biometric policy must check in from the APK. Offline check-in is no longer supported (needs internet).
- [x] Replace Render cold-start screen with branded We HR App Loading view (`web/home.*` `#view-loading` + `mobile_flutter/lib/main.dart` `_wakeServerAndLoad`), redesign UI in Fieldnote decision-first tactile style (`web/styles.css`, `web/index.html`, `web/app.js`, `web/home.*`, `web/admin.css`), and add Render keep-alive (`backend/src/server.js`, `render.yaml`). Deployed live to https://we-hr.onrender.com.
- [ ] **Requires Owner**: Install `releases/apk/WeHR-v2.0.apk` on a physical Android phone and test check-in/out and admin mode (automatically loads the live v2.1 UI from Render).
- [ ] Production: release signing keystore, persistent database (paid plan + disk or Supabase), remove demo accounts/password hint before real company data.
- [ ] **Requires Legal Review Before Commercial Launch**: Verify company-specific employee consent notices under Egyptian Personal Data Protection Law (Law No. 151 of 2020) and Saudi PDPL / MHRSD regulations.
