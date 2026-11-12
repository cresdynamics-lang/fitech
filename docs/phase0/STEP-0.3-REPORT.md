# STEP 0.3 REPORT — Sign-in

Status: **STOP.** The next page does not start until you reply `APPROVED STEP 0.3`.

Marked unlock rules:

- The fingerprint screen shows the fingerprint icon and the words **Use PIN**. It does not also say “use fingerprint”.
- The screen never says “Use Face ID”.
- Face unlock is the device’s own setting. It runs when the app is opened again or the screen wakes, through the system prompt. Fitech does not choose the sensor.
- If that system check does not unlock, the PIN keypad is shown.

Sign-in for a known device uses the device’s own unlock setting, then the glass PIN keypad. A new device starts with the account email and a 6-digit code. The Today page is not built.

Vitest: **9 passed, 0 failed.**

## What was built

- `POST /api/auth/password` checks the password with argon2id. A known device can sign in with the password alone. `requireCode: true` always issues a code. That is the big button on the desktop card.
- A new device, or `requireCode: true`, stores a 6-digit code as a sha256 hash for 5 minutes. There is no email provider. The API prints the code and, unless `NODE_ENV=production`, returns it as `devCode`.
- `POST /api/auth/code` checks that code once. An expired code is rejected and counts as a failed sign-in.
- Three failed sign-ins lock the account. A later correct password is also rejected. No unlock duration is stored, because that duration is still unknown.
- The session cookie is `fitech_session`. It is httpOnly, path `/`, SameSite `Lax`, and has no `Max-Age`. `Secure` is set only when `COOKIE_SECURE=true`.
- `POST /api/auth/refresh` rotates the session token and keeps the previous hash. Presenting the previous token revokes every session for that user.
- Passkey sign-in and registration use `@simplewebauthn/server` 13.3.3. A challenge is stored, used once, and expires after 5 minutes. A passkey sign-in sets `step_up_at`. A password sign-in does not.
- `GET /api/auth/step-up` returns 403 when the passkey check is missing or older than 5 minutes.
- The web app is React and Vite on `http://localhost:5173`. `/api` is proxied to `http://127.0.0.1:3001`.
- A known device is greeted by the account name. It does not ask for a password. The screen uses the unlock method configured on that device. A Mac shows the fingerprint icon and **Use PIN**. The words “use fingerprint” and “Use Face ID” are not on the screen. If the device check does not unlock, the glass keypad is shown and says **Use PIN**. A wrong PIN stays on the keypad and says “Wrong PIN.” The right PIN signs in. The first time, the keypad is used to choose the PIN. A device that is not known yet asks for the account email and the 6-digit setup code.
- Opening the app again, or waking the screen, asks the system for whatever unlock that device has configured. A failed check opens the PIN keypad. The challenge lists only that account's passkeys when one is already saved.
- The password card is not on the sign-in screen. Password routes still exist for the API tests.
- After sign-in the screen says who signed in. It has Sign out, and “Turn on biometrics for this device” only when this device has a platform authenticator.

## Browser check

The app was open at `http://localhost:5173`.

- Desktop, layout viewport 1440×900: the card showed the concept copy, the black panel, the gold logo, the black "Continue with password and code" button, the divider, the two fields, and "Sign in with password".
- Signed in as `owner.dev@fitech.test` with `Dev-owner-0.2` through "Sign in with password". The server asked for a code because that browser had no known device. The code shown on the page was `992121`. After it, the screen was "Signed in", "Dev owner · OWNER". Sign out returned to the card.
- Phone, layout viewport 390×844: the black Face ID screen was the one on screen. "Use PIN instead" opened the email and password form, with "Use Face ID" to go back.

A passkey ceremony was not completed in the browser. No platform authenticator prompt was accepted.

A later change starts the passkey check when the sign-in page opens. Reloading `http://localhost:5173` showed the black screen, "Welcome back, Fitech" and "Look at your iPhone to unlock", and the page called `POST /api/auth/passkey/options`. The password form stays hidden until that check finishes without a sign-in.

## Known-device check against the running API

```
POST /api/auth/password  -> {"needsCode":true,"devCode":"306709"}
POST /api/auth/code      -> {"user":{"name":"Dev owner","email":"owner.dev@fitech.test","role":"OWNER"}}
POST /api/auth/password  -> {"user":{"name":"Dev owner","email":"owner.dev@fitech.test","role":"OWNER"}}
GET  /api/auth/me        -> the same user
```

The second password request sent the device cookie from the code request and did not ask for another code.

## Tests

Database `fitech_test` on `127.0.0.1:5433`. Command:

```
$ corepack pnpm --filter api exec vitest run --reporter=verbose
```

```
 ✓ src/auth.test.ts > auth > locks the account after 3 failed sign-ins
 ✓ src/auth.test.ts > auth > rejects an expired 6-digit code
 ✓ src/auth.test.ts > auth > revokes every session when a rotated session is reused
 ✓ src/auth.test.ts > auth > rejects a passkey step-up older than 5 minutes
 ✓ src/append-only.test.ts > append-only tables > rejects UPDATE and DELETE on device_event
 ✓ src/append-only.test.ts > append-only tables > rejects UPDATE and DELETE on device_cost_entry
 ✓ src/append-only.test.ts > append-only tables > rejects UPDATE and DELETE on payment_record
 ✓ src/append-only.test.ts > append-only tables > rejects UPDATE and DELETE on audit_log
 ✓ src/append-only.test.ts > append-only tables > still allows UPDATE on app_user

 Test Files  2 passed (2)
      Tests  9 passed (9)
```

Exit 0. Duration 1.27s. The append-only tests were run again after migration `0002_auth`.

## Commands

Working directory: `/Users/airm1/Projects/Fitech`. This shell is Node v24.14.1.

```
$ corepack pnpm typecheck
$ tsc --noEmit
$ tsc --noEmit
$ tsc --noEmit
```

Exit 0. Shared, API, and web.

The API was started with `DATABASE_URL=postgres://127.0.0.1:5433/fitech` and printed `api listening on http://127.0.0.1:3001`. That start applied migration `0002_auth`. `known_device`, `login_code`, and `webauthn_challenge` are present in database `fitech`.

Vite printed `Local: http://localhost:5173/`.

## Files changed

| Path | What it is |
| --- | --- |
| `apps/api/src/app.ts` | Auth routes |
| `apps/api/src/server.ts` | Migrate, then listen on port 3001 |
| `apps/api/src/auth.test.ts` | Lockout, code expiry, session reuse, step-up |
| `apps/api/src/db/schema.ts` | `known_device`, `login_code`, `webauthn_challenge` |
| `apps/api/migrations/0002_auth.sql` | Those three tables |
| `apps/api/migrations/meta/_journal.json` | Migration order |
| `apps/api/migrations/meta/0002_snapshot.json` | Drizzle snapshot |
| `apps/api/package.json` | Fastify, cookie, SimpleWebAuthn, shared |
| `apps/api/tsconfig.json` | Bundler resolution so the API can import `shared` |
| `apps/web/index.html` | Web entry |
| `apps/web/src/main.tsx` | React mount |
| `apps/web/src/App.tsx` | Session check and the holding screen |
| `apps/web/src/SignIn.tsx` | Desktop card and phone screen |
| `apps/web/src/styles.css` | Sign-in layout |
| `apps/web/vite.config.ts` | Port 5173 and the `/api` proxy |
| `apps/web/public/logo.png` | Gold Fitech logo |
| `apps/web/package.json` | React, Vite, SimpleWebAuthn browser |
| `packages/shared/src/index.ts` | Lock count, code lifetime, sign-in schemas |
| `packages/shared/package.json` | Zod and the package export |
| `package.json` | `dev:api` and `dev:web` start the two apps |
| `pnpm-lock.yaml` | Lockfile |

## NOT DONE / GAPS

- The Today page is not built. After sign-in the screen only says the next page is not built.
- Login lockout has no duration. Three failures stay locked until something later unlocks the account. Nothing in this step unlocks it.
- Idle timeout duration is still unknown, so a session is not expired for being idle. There is also no absolute session lifetime.
- SameSite is `Lax`. The brief did not choose Lax or Strict. Lax is what lets the local sign-in cookie work.
- No email provider is configured. The code is printed by the API and returned as `devCode` outside production.
- The WebAuthn challenge lifetime of 5 minutes is the same window as the email code. The brief did not name a separate challenge lifetime.
- The 6-digit PIN is checked by the server. `known_device.pin_hash` stores an argon2id hash. The concept said a PIN stays only on the device; the keypad has to accept or reject it, so the hash is stored. The plain PIN is not stored.
- On this browser the Dev owner PIN is 135790. A wrong PIN returned “Wrong PIN.” and left the keypad up. 135790 signed in.
- "Recognised device: Fitech's MacBook" is the sentence from the concept card. The server does not store a device name. `known_device` stores only a token hash.
- A passkey was not registered or used in the browser. The register and verify routes exist. The browser check did not complete a WebAuthn prompt.
- Password sign-in does not count as the 5-minute Face ID step-up. Only a passkey sign-in or a completed passkey registration sets `step_up_at`.
- This shell is Node v24.14.1. The repo still asks for Node 20. Node 20 is not installed here. `@simplewebauthn/server` 13.3.3 allows Node 20.
- The owner tick, sale reference, selling price, closed device lists, IMEI length, and Lipa rates are unchanged from step 0.2. They are still open.
- Lint, the leak test, the Playwright smoke test, and the production build are still the later stubs.

Both processes are still running: the API on `http://127.0.0.1:3001` and the web app on `http://localhost:5173`.
