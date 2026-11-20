# We HR — all versions

Every website and Android app version, newest last. The live website (https://we-hr.onrender.com) always runs the newest version.

- `apk/` — Android app installers. Copy one to the phone and open it. Newer versions install over older ones (same signing key).
- `web/` — website snapshots (`web/` pages + `backend/` server + `package.json`). To run one: unzip, then `node backend/src/server.js` (Node 24) and open http://localhost:3000.

| Version | Date | Website | App | What changed |
|---|---|---|---|---|
| v1.0 | 2026-11-01 | — | `WeHR-v1.0-lan-test.apk` | First test build. Talks to the laptop over home Wi-Fi (`http://192.168.1.7:3000`), so it only works while the laptop server is running. |
| v1.1 | 2026-11-02 | `WeHR-web-v1.1.zip` | `WeHR-v1.1.apk` | Online at https://we-hr.onrender.com. App rebuilt to use the online server over HTTPS. |
| v1.2 | 2026-11-02 | `WeHR-web-v1.2.zip` | (same as v1.1) | `ezz` and `nakkady` logins; username sign-in on the website. |
| v1.3 | 2026-11-02 | `WeHR-web-v1.3.zip` | (same as v1.1) | Admin console at `/admin`: companies, users, branches, workplaces, shifts, devices, payments, audit log. |
| v1.4 | 2026-11-02 | `WeHR-web-v1.4.zip` | `WeHR-v1.4.apk` | Admin mode inside the app (opens the same admin console). |
| v2.0 | 2026-11-03 | `WeHR-web-v2.0.zip` | `WeHR-v2.0.apk` | One web app for website and phone: same sign-in, check-in and admin screens everywhere. The app opens the website and adds phone GPS and fingerprint, so website updates reach the app without reinstalling. |
| v2.1 | 2026-11-20 | `WeHR-web-v2.1.zip` | `WeHR-v2.1.apk` | Settigation / Fieldnote decision-first tactile UI redesign (3-mode chart, 24-tick barcode pulse strips, `Needs you` approval queue), branded We HR App Loading screen (`_wakeServerAndLoad`), and production Render keep-alive pinger. |

Apps v1.1 and later point to https://we-hr.onrender.com. Versions before v2.0 have their own built-in screens, so they don't get the website's newer features.
