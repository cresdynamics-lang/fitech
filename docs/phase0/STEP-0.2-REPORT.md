# STEP 0.2 REPORT — Database and append-only rows

Status: **STOP.** Step 0.3 does not start until you reply `APPROVED STEP 0.2`.

The database is PostgreSQL 16.14. `device_event`, `device_cost_entry`, `payment_record`, and `audit_log` reject `UPDATE` and `DELETE` inside the database. A dev-only seed created one user for each role. Vitest: **5 passed, 0 failed.**

## What was built

- Drizzle schema for the phase 0 entities: `apps/api/src/db/schema.ts`
- SQL migrations applied by Drizzle Kit:
  - `apps/api/migrations/0000_phase0_tables.sql`
  - `apps/api/migrations/0001_append_only.sql`
- Triggers on the four append-only tables. `TRUNCATE` is rejected as well, because it would delete the rows.
- Dev seed: `apps/api/src/db/seed.ts`. It refuses `NODE_ENV=production`.
- Vitest proof: `apps/api/src/append-only.test.ts`
- `DATABASE_URL` is the one environment name added. It is in `.env.example`.

## Decisions used from your approval

| Decision | How it is stored |
| --- | --- |
| Login locks after 3 failures | Comment on `login_attempt`. The count is not enforced until step 0.3. The lock duration is still unknown, so it is not stored. |
| 15 minutes is the restricted-access code | Comment on `permission_grant.access_code_expires_at`. The code is stored only as `access_code_hash`. |
| Web sign-in proceeds | `passkey` and `session` tables exist. No sign-in routes yet. |
| Staff may add a cost during a sale; after that it is restricted | Comment on `device_cost_entry`. There is no Sale table in this phase, so the "during a sale" rule is not enforced yet. |
| Payment methods stay factual, and the rules will be worked on later | `payment_record.method` is text with no fixed list. The comment names cash, M-Pesa, bank, Lipa, and card. |
| Partner data is accepted | `partner` holds dealer, phone, and place. `direction`, `due`, `settlement`, and `swap` are on `device`, because one partner has many phones. |
| Settings are account, profile, permissions, preferences, and more later | `setting` is per user, with `section`, `key`, and `value`. The section list is not closed. |

The super admin who grants restricted access is the OWNER role. No fifth role was added.

## Assumptions used so the migration could be applied

These were not named in the brief. Say if you want them changed before step 0.3.

| Choice | Why |
| --- | --- |
| Primary keys are `uuid` | A key was required and none was specified. |
| Column names are snake_case | The source words needed a SQL spelling. |
| The user table is `app_user` | `user` is a reserved word in PostgreSQL. |
| Money columns are `amount_kes integer` | Every amount in the concept document is whole shillings. |
| `device.origin` is `new`, `ex_uk`, `trade_in`, or `borrowed` | Those are the four code sources in the brief. The column name `origin` was not in the brief. |
| Ex-UK `code` must equal `imei` | The brief says the supplier barcode is the IMEI and is the unique code. |
| Trade-in and borrowed codes must be 13 digits | The brief says the system generates a 13-digit code. |
| Argon2id parameters are memory 19456, time 2, parallelism 1 | The brief names argon2id and does not name parameters. These are the OWASP minimums. |
| Seed status is `Active` | That is the word on the staff screen for someone who can sign in. The full status list is still open. |
| Passkey stores credential id, public key, and signature counter | Required by WebAuthn, which the brief names. |
| Session stores a token hash, the previous token hash, last seen time, step-up time, and revoked time | These are the fields the session rules need. Idle timeout duration and SameSite mode are still not set. |
| No owner-tick column on `payment_record` | A later tick would be an update, and this table rejects updates. How the tick is stored is still open. |
| No `sale` reference | Sale is not a phase 0 entity. |

## Dev users

Database `fitech` on `127.0.0.1:5433`. Passwords are development only.

| Role | Email | Password |
| --- | --- | --- |
| OWNER | owner.dev@fitech.test | Dev-owner-0.2 |
| MANAGER | manager.dev@fitech.test | Dev-manager-0.2 |
| CASHIER | cashier.dev@fitech.test | Dev-cashier-0.2 |
| INVENTORY | inventory.dev@fitech.test | Dev-inventory-0.2 |

Hashes start with `$argon2id$`. The seed command exits 1 when `NODE_ENV=production`.

## Files changed

| Path | What it is |
| --- | --- |
| `apps/api/src/db/schema.ts` | Drizzle schema |
| `apps/api/src/db/seed.ts` | Dev-only seed |
| `apps/api/src/append-only.test.ts` | Update and delete rejection tests |
| `apps/api/migrations/0000_phase0_tables.sql` | Tables |
| `apps/api/migrations/0001_append_only.sql` | Roles, comments, triggers |
| `apps/api/migrations/meta/_journal.json` | Migration order |
| `apps/api/migrations/meta/0000_snapshot.json` | Drizzle snapshot |
| `apps/api/drizzle.config.ts` | Drizzle Kit config |
| `apps/api/vitest.config.ts` | Vitest, default test database `fitech_test` |
| `apps/api/package.json` | API scripts and dependencies |
| `apps/api/tsconfig.json` | Typecheck includes `src` |
| `package.json` | Root scripts call the API typecheck, test, migrate, and seed |
| `pnpm-workspace.yaml` | Allows the argon2 and esbuild build scripts |
| `pnpm-lock.yaml` | Lockfile |
| `.env.example` | `DATABASE_URL` only |
| `docs/phase0/STEP-0.1-REPORT.md` | Approval decisions added |
| `docs/phase0/STEP-0.2-REPORT.md` | This report |

## NOT DONE / GAPS

- Step 0.3 auth is not started. There are no sign-in routes, no emailed code, and no session cookie.
- Login lockout is not enforced. The duration after 3 failures is still unknown.
- Idle timeout duration and SameSite (`Lax` or `Strict`) are still unknown.
- The WebAuthn challenge has no table. The brief says it is stored server-side and used once. A new table was not added.
- The owner tick on a payment has no column.
- A cost cannot yet be tied to a sale, because Sale is not a table.
- Selling price still has no column.
- Device condition, status, battery, and storage have no closed lists. They are text.
- IMEI length is not checked.
- A New device's code is not checked against the box QR or the serial. Those two can differ, and the brief does not say which one wins.
- Partner settlement is text on the device. If that text is money, a later edit would violate the rule that financial history is not edited. It is not append-only in this step.
- Settings have no seeded keys. Lipa rates were not added.
- This shell is Node v24.14.1. The repo still asks for Node 20. Node 20 is not installed here. Tests ran on Node 24.
- `pnpm` is not on `PATH`. Commands use `corepack pnpm`.
- Port 5432 is PostgreSQL 18, which was left running. The Homebrew `postgresql@16` service was stopped because it was crash-looping on that port. PostgreSQL 16.14 was started on port 5433 with the existing Homebrew data directory `/opt/homebrew/var/postgresql@16`.
- Lint, leak test, end-to-end test, build, and the web app are still the step 0.5 and 0.6 stubs.

## Commands run

Working directory: `/Users/airm1/Projects/Fitech`.

PostgreSQL 16 was started with:

```
/opt/homebrew/opt/postgresql@16/bin/postgres -D /opt/homebrew/var/postgresql@16 -p 5433
```

```
$ /opt/homebrew/opt/postgresql@16/bin/psql -p 5433 -d fitech_test -c "SELECT version();"
 PostgreSQL 16.14 (Homebrew) on aarch64-apple-darwin25.4.0, compiled by Apple clang version 21.0.0 (clang-2100.0.123.102), 64-bit
```

```
$ corepack pnpm typecheck
$ tsc --noEmit
```

Exit 0.

```
$ DATABASE_URL=postgres://127.0.0.1:5433/fitech corepack pnpm db:migrate
$ drizzle-kit migrate
[✓] migrations applied successfully!
```

Exit 0.

```
$ DATABASE_URL=postgres://127.0.0.1:5433/fitech corepack pnpm db:seed
inserted OWNER owner.dev@fitech.test
inserted MANAGER manager.dev@fitech.test
inserted CASHIER cashier.dev@fitech.test
inserted INVENTORY inventory.dev@fitech.test
argon2id memoryCost=19456 timeCost=2 parallelism=1
```

Exit 0.

```
$ NODE_ENV=production DATABASE_URL=postgres://127.0.0.1:5433/fitech corepack pnpm db:seed
seed refused: NODE_ENV is production
[ELIFECYCLE] Command failed with exit code 1.
```

Exit 1.

```
$ /opt/homebrew/opt/postgresql@16/bin/psql -p 5433 -d fitech -c "SELECT u.email, r.code, u.status, left(u.password_hash, 11) AS hash_prefix FROM app_user u JOIN role r ON r.id = u.role_id ORDER BY r.code;"
           email           |   code    | status | hash_prefix
 cashier.dev@fitech.test   | CASHIER   | Active | $argon2id$v
 inventory.dev@fitech.test | INVENTORY | Active | $argon2id$v
 manager.dev@fitech.test   | MANAGER   | Active | $argon2id$v
 owner.dev@fitech.test     | OWNER     | Active | $argon2id$v
(4 rows)
```

Database rejections on `fitech_test`, after the test had inserted one row in each append-only table. Each statement exited 1. The rows were still there afterwards.

```
### UPDATE device_event
ERROR:  append-only table device_event rejects UPDATE
### DELETE device_event
ERROR:  append-only table device_event rejects DELETE
### UPDATE device_cost_entry
ERROR:  append-only table device_cost_entry rejects UPDATE
### DELETE device_cost_entry
ERROR:  append-only table device_cost_entry rejects DELETE
### UPDATE payment_record
ERROR:  append-only table payment_record rejects UPDATE
### DELETE payment_record
ERROR:  append-only table payment_record rejects DELETE
### UPDATE audit_log
ERROR:  append-only table audit_log rejects UPDATE
### DELETE audit_log
ERROR:  append-only table audit_log rejects DELETE
### TRUNCATE audit_log
ERROR:  append-only table audit_log rejects TRUNCATE

         t         | count
 device_event      |     1
 device_cost_entry |     1
 payment_record    |     1
 audit_log         |     1
```

## Tests

```
$ corepack pnpm test
$ vitest run

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  419ms
```

- Passed: 5
- Failed: 0

The five tests are: update and delete rejected on `device_event`, `device_cost_entry`, `payment_record`, and `audit_log`, and update still allowed on `app_user`. Each rejection test also reads the row back and checks the original value.

`test:leak` and `test:e2e` are still stubs and were not part of this step.
