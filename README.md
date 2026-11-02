# We HR — Enterprise Multi-Tenant HR & Geofenced Attendance SaaS Platform

**We HR** is a multi-tenant Human Resources and Smart Attendance Management platform designed for companies, factories, warehouses, branches, and field teams in **Egypt, Saudi Arabia, and the Gulf region**.

It features:
- **Server-Verified GPS Geofencing**: Independent backend Haversine distance calculation, horizontal GPS accuracy thresholds, reading freshness checks, and mock-location spoofing detection.
- **Strict Operating-System Biometric Distinction**: Uses Android `BiometricPrompt` and iOS `LocalAuthentication` (`Face ID` / `Touch ID`) via Flutter `local_auth`, strictly distinguishing true biometric authentication (`biometric_strong`) from generic device credentials (`device_credential` PIN/pattern/passcode) and HR-approved exception workflows.
- **Anti-Buddy-Punching Device Binding**: Tracks employee-registered mobile devices (`approved_devices`) and detects or blocks attempts where one employee logs into another colleague's phone to scan the colleague's fingerprint.
- **Authoritative & Immutable Attendance Ledger**: Server-generated timestamps, idempotency protection against duplicate taps/slow networks, offline pending queue with expiration revalidation, regular & overnight (cross-midnight) shift calculations, and append-only database triggers preventing deletion or tampering of raw `attendance_events` and `audit_logs`.
- **Full Arabic (RTL) & English (LTR) Localization**: Built-in right-to-left Arabic and left-to-right English interfaces across both the HR Administration Web Dashboard and the Flutter Mobile Application.

---

## 1. Quick Start on Your Windows Laptop & VS Code (Zero Paid Tools Required)

Node.js (`v24.21.0`) is already installed on your Windows laptop. You can run the complete backend, SQLite relational database, HR Web Dashboard, and Interactive Mobile Attendance Simulator immediately:

### Step 1: Open Terminal in VS Code
1. Open VS Code (`File -> Open Folder...` -> select `C:\Users\elnakkady\Desktop\We HR`).
2. Press `` Ctrl + ` `` (or `Terminal -> New Terminal`).

### Step 2: Run Automated Tests
```powershell
npm test
```
**Expected successful output:**
All 12 unit, integration, and end-to-end HTTP test suites pass (`ℹ pass 12`, `ℹ fail 0`).

### Step 3: Start the We HR Server & Web Dashboard
```powershell
npm start
```
**Expected successful output:**
```text
======================================================================
  We HR — Enterprise Multi-Tenant HR & Attendance SaaS Platform
  Web Dashboard & API running at: http://127.0.0.1:3000
  Default Demo Password for seeded accounts: WeHR@2026
======================================================================
```
Open **`http://127.0.0.1:3000`** in Google Chrome or Microsoft Edge.

---

## 2. Pre-Seeded Multi-Tenant Accounts (Password: `WeHR@2026`)

| Tenant / Company | Role | Email | Notes |
| :--- | :--- | :--- | :--- |
| **Nile Delta (Egypt)** | `company_owner` | `owner@niledelta.eg` | Full company, billing & HR control |
| **Nile Delta (Egypt)** | `hr_admin` | `hr@niledelta.eg` | Employees, workplaces, attendance, CSV import/export |
| **Nile Delta (Egypt)** | `branch_manager` | `manager.cairo@niledelta.eg` | Scoped strictly to Cairo HQ branch |
| **Nile Delta (Egypt)** | `supervisor` | `supervisor@niledelta.eg` | Scoped strictly to direct team reports |
| **Nile Delta (Egypt)** | `employee` | `ahmed.saeed@niledelta.eg` | Strict OS Biometric required, Cairo HQ geofence |
| **Nile Delta (Egypt)** | `employee` | `mahmoud.fathy@niledelta.eg` | 10th of Ramadan Factory — Overnight Shift (`22:00 - 06:00`) |
| **Nile Delta (Egypt)** | `employee` | `sara.kamal@niledelta.eg` | Has HR-approved biometric exception |
| **Al-Abraj (Saudi Arabia)** | `hr_admin` | `hr@alabraj.sa` | Isolated KSA tenant (`Asia/Riyadh`, `SAR`) |
| **Al-Abraj (Saudi Arabia)** | `employee` | `yasser@alabraj.sa` | Riyadh Olaya Tower geofence |
| **Platform Operations** | `platform_super_admin` | `admin@wehr.cloud` | Tenant & payment verification (restricted from casual employee location access) |

---

## 3. Repository Structure

- `backend/src/domain/`
  - [`geofence.js`](file:///c:/Users/elnakkady/Desktop/We%20HR/backend/src/domain/geofence.js) — Server-side Haversine distance, coordinate validation, accuracy/freshness rules, mock-location & impossible-travel checks.
  - [`biometrics.js`](file:///c:/Users/elnakkady/Desktop/We%20HR/backend/src/domain/biometrics.js) — Biometric vs. PIN/passcode policy evaluator & device-binding anti-buddy-punching check.
  - [`attendance_rules.js`](file:///c:/Users/elnakkady/Desktop/We%20HR/backend/src/domain/attendance_rules.js) — State machine transitions, regular & overnight cross-midnight shift anchor resolver, late/early/overtime calculator, and offline queue expiration validator.
  - [`rbac.js`](file:///c:/Users/elnakkady/Desktop/We%20HR/backend/src/domain/rbac.js) — 6-role RBAC permission matrix, strict tenant boundary verification, and subscription grace-period evaluator.
- `backend/src/db/`
  - [`database.js`](file:///c:/Users/elnakkady/Desktop/We%20HR/backend/src/db/database.js) — Relational SQLite schema & immutability triggers (`node:sqlite`).
  - [`seed.js`](file:///c:/Users/elnakkady/Desktop/We%20HR/backend/src/db/seed.js) — Multi-tenant Egypt & Saudi Arabia seed records.
- `backend/src/services/`
  - [`hr_service.js`](file:///c:/Users/elnakkady/Desktop/We%20HR/backend/src/services/hr_service.js) — Authoritative transactional business logic.
- `backend/src/`
  - [`server.js`](file:///c:/Users/elnakkady/Desktop/We%20HR/backend/src/server.js) — REST API & static Web Dashboard server.
- `backend/tests/`
  - [`unit.test.js`](file:///c:/Users/elnakkady/Desktop/We%20HR/backend/tests/unit.test.js), [`integration.test.js`](file:///c:/Users/elnakkady/Desktop/We%20HR/backend/tests/integration.test.js), [`http_api.test.js`](file:///c:/Users/elnakkady/Desktop/We%20HR/backend/tests/http_api.test.js)
- `supabase/migrations/`
  - [`001_we_hr_schema_and_rls.sql`](file:///c:/Users/elnakkady/Desktop/We%20HR/supabase/migrations/001_we_hr_schema_and_rls.sql) — Production PostgreSQL schema, `calculate_haversine_meters` SQL function, immutability triggers, and Supabase Row Level Security (RLS) policies.
- `web/`
  - [`index.html`](file:///c:/Users/elnakkady/Desktop/We%20HR/web/index.html), [`styles.css`](file:///c:/Users/elnakkady/Desktop/We%20HR/web/styles.css), [`i18n.js`](file:///c:/Users/elnakkady/Desktop/We%20HR/web/i18n.js), [`app.js`](file:///c:/Users/elnakkady/Desktop/We%20HR/web/app.js) — Bilingual Arabic RTL & English LTR HR Web Dashboard + Interactive Employee Mobile Attendance Simulator.
- `mobile_flutter/`
  - [`pubspec.yaml`](file:///c:/Users/elnakkady/Desktop/We%20HR/mobile_flutter/pubspec.yaml), [`lib/main.dart`](file:///c:/Users/elnakkady/Desktop/We%20HR/mobile_flutter/lib/main.dart), [`lib/services/biometric_auth_service.dart`](file:///c:/Users/elnakkady/Desktop/We%20HR/mobile_flutter/lib/services/biometric_auth_service.dart), [`lib/services/location_geofence_service.dart`](file:///c:/Users/elnakkady/Desktop/We%20HR/mobile_flutter/lib/services/location_geofence_service.dart), [`lib/services/offline_attendance_queue.dart`](file:///c:/Users/elnakkady/Desktop/We%20HR/mobile_flutter/lib/services/offline_attendance_queue.dart), Android & iOS native manifests.

---

## 4. Building the Flutter Android APK & iOS Preparation

> **Honest Environment Note:** Inspection of this Windows machine showed that the **Flutter SDK** and **Android SDK / Java JDK** are not currently installed on this computer, so an Android `.apk` binary has not been compiled yet. All Flutter source code and native Android/iOS configurations are ready in `mobile_flutter/`.

### How to Install Flutter & Build the Android APK on Windows:
1. Install the **Flutter SDK for Windows** from [docs.flutter.dev/get-started/install/windows](https://docs.flutter.dev/get-started/install/windows) and **Android Studio** (with Android SDK Command-line Tools).
2. Verify installation in PowerShell:
   ```powershell
   flutter doctor
   ```
3. Build the Android APK pointing to your backend server IP:
   ```powershell
   cd "c:\Users\elnakkady\Desktop\We HR\mobile_flutter"
   flutter pub get
   flutter test
   flutter build apk --release --dart-define=WE_HR_API_URL=https://your-api-domain.example.com
   ```
   Once built, Flutter outputs the APK at:
   `mobile_flutter\build\app\outputs\flutter-apk\app-release.apk`.

### iOS Build Requirements:
- Building and signing an iOS app (`.ipa`) requires a macOS machine (or CI runner such as Codemagic/GitHub Actions macOS) with Xcode and an active Apple Developer Program account ($99/year).
- `mobile_flutter/ios/Runner/Info.plist` is already configured with `NSFaceIDUsageDescription` and `NSLocationWhenInUseUsageDescription`.

---

## 5. Known Limitations & Production Readiness Notes

1. **Local Biometric Identity Limitation**: Standard OS `BiometricPrompt` / `LocalAuthentication` verifies that *an enrolled biometric on the handset* matched locally; it does not cryptographically prove which human's finger is enrolled if an employee enrolls a coworker's fingerprint on their phone. To mitigate this, We HR implements **Employee-Device Registration (`approved_devices`)**, **Shared-Device Detection (`SHARED_DEVICE_USED_BY_ANOTHER_EMPLOYEE`)**, and audit trails. For higher-assurance deployments, hardware-backed WebAuthn/Passkey or Android KeyAttestation / iOS App Attest can be enabled.
2. **GPS Spoofing Limitation**: `isMockLocation` flags standard Android developer mock-location providers, and server-side velocity checks flag impossible travel speeds, but rooted/jailbroken devices or RF GNSS simulators can bypass OS mock flags. Suspicious events are flagged as `needs_review` rather than assuming GPS is infallible.
3. **No Paid Third-Party Services Enabled by Default**: Maps, SMS gateways, and payment gateways are intentionally not bound to paid external APIs until you approve a provider and budget.
