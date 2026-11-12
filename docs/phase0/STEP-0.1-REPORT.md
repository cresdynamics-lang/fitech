# STEP 0.1 REPORT — Foundation map

Status: **APPROVED.** Step 0.2 was started after the decisions below. The original map in this file was not rewritten.

## Decisions recorded from approval

These answers replace the matching questions. Anything not listed here stayed unanswered and is repeated in the step 0.2 report.

| Topic | Decision |
| --- | --- |
| Login lockout count | 3 failures. This is the login rule. |
| 15 minutes | Not the login lockout. It is the lifetime of the code sent when the super admin grants restricted access. |
| Lockout duration | Still not stated. It was not set to 15 minutes. |
| Sign-in | Web sign-in proceeds as in the brief: passkey first, password and emailed code as the fallback. |
| Costs | Staff may add a cost during a sale. After the sale, cost access is restricted. |
| Payment method | Store the methods the documents already name. The payment rules are still to be worked out. No extra methods were added. |
| Partner | The partner fields from the data map are accepted. |
| Setting | Account settings for the same profile: account, profile, permissions, preferences, and further sections later. |
| Delivery | This approval includes pushing the git repo to `https://github.com/cresdynamics-lang/fitech.git`. |

Sources used for every row below:

- The phase 0 build brief (the message that defined this step).
- *Fitech Operations System*, concept document, version 3, prepared by Cres Dynamics Ltd, November 2026, 53 pages. Cited below as “concept” plus the page number.
- The logo PDF contains only the line “APPLE PRODUCTS FOR EVERY JOURNEY”. It has no data model and was not used.

The concept PDF embeds “a” and the digits 0–9 in a private-use font. Text was extracted with pypdf and those glyphs were mapped back (`U+E02C` → a, `U+E071`–`U+E07A` → 0–9, punctuation mapped from surrounding words). The data-map page lists 20 entity groups and then 20 attribute groups, in the same order. Each attribute group below is paired to the entity group in that position. The pairs also match the headings (payment methods sit with PaymentRecord, the Face ID key sits with device keys). If a pair is wrong, say so before step 0.2.

Attribute names below are the words from those sources. SQL table names, SQL column identifiers, and PostgreSQL types are **not set** unless the value itself forces a type (a code, an email, a hash). Those unset names are in QUESTIONS. Nothing in this file is a migration.

## What was built

A pnpm workspace skeleton and this report.

- Workspace packages: `apps/api` (`api`), `apps/web` (`web`), `packages/shared` (`shared`). No source files.
- TypeScript `strict` is set in `tsconfig.base.json` and in each package tsconfig. The TypeScript compiler is not installed.
- Root scripts exist and exit 1 with a step number. They do not lint, typecheck, test, or build.
- `.nvmrc` and `package.json` `engines.node` say `20`. This shell is Node v24.14.1. Node 20 is not installed here.
- `.env.example` contains no variable names.
- Git was initialised. Nothing was committed.

## Files changed

| Path | What it is |
| --- | --- |
| `package.json` | Private root package, pnpm 12.18.0, Node `20.x`, stub scripts |
| `pnpm-workspace.yaml` | `apps/*`, `packages/*` |
| `pnpm-lock.yaml` | Lockfile from `pnpm install` (no dependencies) |
| `tsconfig.base.json` | `strict: true`, NodeNext, ES2022 |
| `apps/api/package.json` | Empty API package |
| `apps/api/tsconfig.json` | Extends the base, `strict: true` |
| `apps/web/package.json` | Empty web package |
| `apps/web/tsconfig.json` | Extends the base, `strict: true` |
| `packages/shared/package.json` | Empty shared package |
| `packages/shared/tsconfig.json` | Extends the base, `strict: true` |
| `scripts/not-implemented.js` | Prints the scheduled step and exits 1 |
| `.nvmrc` | `20` |
| `.gitignore` | Dependencies, build output, secrets, test output |
| `.env.example` | Comment only. No names |
| `docs/phase0/STEP-0.1-REPORT.md` | This report |
| `.git/` | `git init`. No commit |

## Folder tree

Captured after this report was written. `node_modules/` exists (pnpm created it) and is omitted here because it is gitignored. The `find` command is in “Commands run”; its output matches this block.

```
.
./.env.example
./.gitignore
./.nvmrc
./apps
./apps/api
./apps/api/package.json
./apps/api/tsconfig.json
./apps/web
./apps/web/package.json
./apps/web/tsconfig.json
./docs
./docs/phase0
./docs/phase0/STEP-0.1-REPORT.md
./package.json
./packages
./packages/shared
./packages/shared/package.json
./packages/shared/tsconfig.json
./pnpm-lock.yaml
./pnpm-workspace.yaml
./scripts
./scripts/not-implemented.js
./tsconfig.base.json
```

## Scripts

Declared in the root `package.json`. Each one runs `scripts/not-implemented.js` and exits 1. Real output is in “Commands run”.

| Script | Scheduled step | Result on this run |
| --- | --- | --- |
| `lint` | 0.6 | exit 1 |
| `typecheck` | 0.6 | exit 1 |
| `test` | 0.2 | exit 1 |
| `test:unit` | 0.2 | exit 1 |
| `test:leak` | 0.5 | exit 1 |
| `test:e2e` | 0.6 | exit 1 |
| `build` | 0.6 | exit 1 |
| `dev:api` | 0.2 | exit 1 |
| `dev:web` | 0.6 | exit 1 |

`pnpm` is not on `PATH`. The command used was `corepack pnpm` (Corepack 0.34.6). Corepack downloaded pnpm 12.18.0. That version’s own `engines.node` is `>=18`, so it can run on Node 20. The brief does not name a pnpm version. The pin is the version this machine actually downloaded. See Q20.

## Env var list (names only)

**No names are approved.** The brief and the concept document do not name an environment variable. `.env.example` therefore has none. Suggested names are under PROPOSED, NOT BUILT, not in the example file.

## DB migration approach

Not built. This is the approach step 0.2 will follow if this step is approved and the open questions that block a column are answered.

- Database: PostgreSQL 16. ORM: Drizzle. Migrations: SQL files, one new file per change, applied in order. An applied file is not edited.
- The Drizzle schema is the source of the tables. Drizzle Kit generates the SQL. Append-only rules are extra SQL in that same migration: a trigger that rejects `UPDATE` and `DELETE`. App code is not the enforcement.
- Tables that step 0.2 must make append-only, once their columns are settled: DeviceEvent, DeviceCostEntry, PaymentRecord, AuditLog.
- Corrections to those tables are new rows (brief, absolute rule 3; concept p.17 for cost entries).
- The four dev users (one OWNER, one MANAGER, one CASHIER, one INVENTORY, test passwords) are a dev-only seed in step 0.2, not a production migration. No seed was written.
- The directory for SQL files is not named in the brief. See PROPOSED, NOT BUILT.

## Rules that are already fixed

These are not columns. They constrain later steps.

| Rule | Source |
| --- | --- |
| Roles are OWNER, MANAGER, CASHIER, INVENTORY | Brief. Concept p.5 labels the same four as Fitech (Owner), Branch manager, Cashier, Inventory lead |
| Only OWNER sees cost, buying price, profit, margin, expenses, payroll, stock value, Lipa totals. No standing grant gives that view | Brief; concept p.5 and p.53 |
| Standing grants that exist: `costs.add` and `repairs.manage`. Both are write-only | Brief; concept p.5 |
| A temporary unlock to read a cost lasts from 5 minutes to 8 hours, is approved by the OWNER, and is logged | Brief; concept p.5 and p.36 |
| Only OWNER records expenses, marketing spend, and salaries | Brief; concept p.53 |
| The app records payments. It does not collect them. No payment gateway | Brief; concept p.3 and p.53 |
| One Device row per physical phone, kept forever. The same phone keeps its code through resale. Borrowed and dealer phones are Devices | Concept p.4 |
| Code rule: New = box QR/serial. Ex-UK = supplier barcode, and that barcode is the IMEI. Trade-in and borrowed = system-generated 13-digit code. IMEI is always stored as well | Brief; concept p.2, p.19, p.41, p.42 |
| A trade-in enters only through a sale | Brief |
| Every device action is a timeline row. The timeline has no amounts | Brief; concept p.4 and p.21 |
| DeviceEvent, DeviceCostEntry, PaymentRecord, AuditLog are append-only | Brief step 0.2; concept p.3 and p.4 |
| Alerts and email are sent from `info@fitech.co.ke`. They never contain finance figures | Brief; concept p.48 and p.53 |
| No self sign-up. The owner creates accounts | Concept p.6 and p.34 |
| Passkeys are the primary sign-in (Face ID on iPhone Safari). Fallback is email, password (argon2id), and a 6-digit code emailed to owner inboxes | Brief step 0.3 |
| The 6-digit code is valid for 5 minutes | Concept p.6. The brief requires a code-expiry test and does not restate the duration |
| Sessions: cookie is Secure, HttpOnly, and SameSite; the session rotates; idle timeout; reuse of a rotated session revokes all sessions for that user | Brief step 0.3. Durations and the SameSite mode are not stated. See Q4 and Q5 |
| Sensitive actions need a fresh passkey check within the last 5 minutes | Brief step 0.3; concept p.6 |
| Every sign-in and every failed sign-in is written to AuditLog | Brief step 0.3 |
| One shop, named NUH in the concept doc, with a branch possible later. No branch table is in this phase | Concept p.2 |
| Landed cost is the sum of a device’s cost entries. It is computed, not stored as its own row | Concept p.4 and p.17 |
| People with sales history are suspended, never deleted. The last active super admin cannot be removed or demoted | Concept p.34. “Super admin” is not a fifth role in the brief. See Q8 |

## Entity tables

“Type” is a PostgreSQL type only where the source forces it. `NOT SET` means the column is named but step 0.2 cannot pick a type until you answer the linked question. Attributes that are not clearly columns are not in these tables; they are only in QUESTIONS.

### User

A person who can sign in. Created by the owner. No self sign-up.

| Attribute (source word) | Type | Notes | Source |
| --- | --- | --- | --- |
| name | text | Staff list column “NAME” | Concept p.34 |
| email | text | Sign-in is email and password | Concept p.6, p.7 |
| password | text | Stored as an argon2id hash. The raw password is not stored. Hash parameters are not set (Q17) | Brief step 0.3 |
| role | NOT SET | One of the four Role values. Whether this is a foreign key or a Postgres enum is Q2 | Brief |
| status | NOT SET | Screen shows Active and Off shift. The same page also says people are suspended. The allowed values are not a closed list (Q7) | Concept p.34 |

### Role

The brief lists Role as its own entity. The data map does not give it columns of its own; it groups “User, Role, Permission” as “owner, manager, cashier, inventory lead, grants”.

| Attribute | Type | Notes | Source |
| --- | --- | --- | --- |
| code | text | Exactly `OWNER`, `MANAGER`, `CASHIER`, `INVENTORY` | Brief |

The concept’s display labels (Fitech / Owner, Branch manager, Cashier, Inventory lead) are not a column. See Q3.

### PermissionGrant

Staff hold grants. The two standing keys are write-only. A read of cost is a separate, expiring unlock. The permission key for that read is not named anywhere. Step 0.2 cannot create this table until Q9 is answered. The attributes that *are* named:

| Attribute (source word) | Type | Notes | Source |
| --- | --- | --- | --- |
| `costs.add` | the literal key | Standing, write-only. Lets a person add a cost line. Does not let them read one | Brief; concept p.5 |
| `repairs.manage` | the literal key | Standing, write-only. Concept wording is “update repairs” | Brief; concept p.5 |
| expiry | NOT SET | The brief says the entity has expiry. For a temporary read, the allowed window is 5 minutes to 8 hours. Whether a standing grant has an empty expiry is Q10 | Brief; concept p.5 |
| reason | text | Example on the approve screen: “price check on supplier invoice” | Concept p.36 |

Also fixed, but not a column name: only the OWNER approves a grant, with a passkey check, and the grant is logged. The grant is held by a staff user. The column name for “which user” is not in the source (Q11).

### Session

No column names are in the source. Behaviors that are fixed:

- The cookie is Secure, HttpOnly, and SameSite. Which SameSite mode is Q4.
- The session rotates.
- Idle timeout exists. The duration is Q5.
- Reuse of an old session identifier revokes every session for that user.
- A step-up timestamp is required by the rule “fresh passkey check within the last 5 minutes”. The column name is not given (Q6).

No Session columns are decided.

### Passkey

The concept calls this the “Face ID key”. The brief says registration and login use `@simplewebauthn/server`, and the challenge is stored server-side and is single use. There is no Challenge entity in the phase 0 list, so the challenge cannot become a new table without your approval (Q12).

WebAuthn itself requires a credential id, a public key, and a signature counter, tied to the user. Those names come from the WebAuthn credential record, not from the concept document. They are listed here so the protocol requirement is visible. They are not approved as Fitech columns until you accept Q13.

| Protocol field | Why it is listed |
| --- | --- |
| credential id | WebAuthn credential identifier |
| public key | The key stays on the server. Face data never leaves the phone (concept p.6) |
| signature counter | WebAuthn clone detection |
| user | The account the key unlocks |

Revoke is specified (concept p.6 and p.34: a lost phone is signed out immediately). The column or flag that stores “revoked” is not named (Q14).

The staff screen shows device labels (“iPhone 16 Pro”, “Fitech's MacBook”, “Shop PC”). There is no TrustedDevice entity in this phase. See Q15.

PIN is in the same data-map blob as the Face ID key (“Face ID key, PIN, revoke”). Concept p.6 says the PIN is 6 digits and stored only on the device. It is not a server column on that evidence. The brief’s auth step does not mention a PIN. See Q16.

### LoginAttempt

The brief names the entity. Neither document names a column. What is known is the purpose: failed sign-ins count toward a lockout, and each failure is also an AuditLog row. The lockout numbers conflict. See Q1. No columns are decided.

### AuditLog

Append-only in step 0.2. The data-map blob “what happened, to whom, who asked what” is attached to the group “Notification, AuditLog, AssistantChat”, not to AuditLog alone. Notification and AssistantChat are not phase 0 entities. See Q18.

What the brief does assign to AuditLog: every sign-in, and every failed sign-in. Grants are logged (concept p.5). The column layout for that is not given. No columns are decided.

### Device

One row per physical phone, forever.

| Attribute (source word) | Type | Notes | Source |
| --- | --- | --- | --- |
| code | text | Not a number. New: box QR/serial. Ex-UK: the IMEI. Trade-in and borrowed: 13-digit generated code. Length and character set for a New code are not stated (Q21) | Data map p.4; brief |
| IMEI | text | Always stored, including when the code is not the IMEI. Digit length is not stated in the document (Q22) | Data map p.4; brief |
| serial | text | | Data map p.4 |
| model | text | The catalog entity “Model and variant” is not in this phase. For now this is a value on Device. See PROPOSED | Data map p.4 |
| colour | text | Spelling in the document is “colour” | Data map p.4 |
| storage | NOT SET | Screens show values such as `128GB`. Integer versus text is Q23 | Data map p.4 |
| condition | NOT SET | No closed list. Screens use “good or bad” and “broken or ready” (Q24) | Data map p.4; concept p.41 |
| battery | NOT SET | Screens show a percentage (“Battery 82%”, “100%”). Unit and type are Q25 | Data map p.4 |
| status | NOT SET | No closed list (Q26) | Data map p.4 |
| current location | NOT SET | Named separately from status. No vocabulary (Q27) | Data map p.4 |

The brief needs a distinction between New, Ex-UK, trade-in, and borrowed in order to choose the code. The data map does not name that field. It is not a column until Q28 is answered.

Not taken from the Ex-UK receive screen, because they are not in the data-map list and the label date is an open decision on concept p.53: part number, FMI, SIM, version, label date. See Q29.

Selling price is visible to every role (concept p.5) and is not in the Device attribute list. The timeline cannot hold amounts. Where the selling price is stored is Q30. It is not a Device column in this map.

### DeviceEvent

Append-only. Many rows per Device. No amounts on the row.

The data-map attribute group for this entity is a list of what happened, not a list of columns:

`received`, `traded in`, `repaired`, `priced`, `sold`, `out for delivery`, `delivered`, `returned`, `with dealer`, `swapped`.

The device passport (concept p.21) also uses “Code generated”, “Sent for repair”, “Returned, priced”, “Back in stock”, and “Listed”. Whether those are the same events or extra types is Q31.

A row has to say which device it belongs to, what happened, when, and who did it. Passport lines name a person and a date. The column names for device, when, and who are not in the source (Q32). No columns are decided beyond the event-type words above and the rule “no amount column”.

### DeviceCostEntry

Append-only. Many rows per Device. Landed cost is the sum, not a stored row. A correction is a new row.

The data-map attribute group is the kind of cost:

`purchase`, `freight`, `repair`, `parts`, `trade-in value`.

Concept p.17 shows a repair line with a description (“Screen repair”), a repairer name (“Mwangi Repairs”), and an amount in KES. RepairJob is a different entity and is not in this phase. Description, repairer, and the money column name are Q33. No money column is decided. Currency is not a named field; every amount in the document is written as KES (Q34).

### Partner

The data map has one group, “Partner and Consignment”, with the words `dealer`, `direction`, `due`, `settlement`, `swap`. Consignment is not an entity in this phase. Those five words may describe an arrangement between a partner and a phone, which would be a table this phase is not allowed to add. The partner screen (concept p.24) also shows a name, a phone number, and a place (“Luthuli Ave”).

No Partner columns are decided. See Q35.

### PaymentRecord

Append-only. Staff record the payment. The app does not collect it.

| Attribute (source word) | Type | Notes | Source |
| --- | --- | --- | --- |
| method | NOT SET | Data-map list: `cash`, `M-Pesa`, `bank`, `Lipa`. Card is on the sale screens and on concept p.2, and is not in this list (Q36) | Data map p.4 |
| code or reference | text | M-Pesa confirmation code, or bank reference. Required for those methods on concept p.12 | Data map p.4; concept p.12 |

The owner tick is specified for M-Pesa and bank (concept p.12: those entries wait for Fitech’s tick). A tick cannot be an `UPDATE` of an append-only row. How the tick is stored is Q37. No tick column is decided.

“Amount received” is a label on the payment screen (concept p.12). It is not in the data-map attribute group. The money column is Q38. No amount column is decided.

Sale is not a phase 0 entity. A payment in the full model belongs to a sale. No `sale` reference is decided (Q39).

“Recorded by” the signed-in staff member is a rule. The column name is Q40.

### Setting

The brief names the entity. The concept document has a Settings nav item and one sentence: Fitech sets Lipa rates in Settings (concept p.13). Those rates are an open decision (concept p.53: the ×1.3 to ×1.8 figures are samples). No setting key and no column is named.

No Setting columns are decided. See Q41.

## QUESTIONS

Answer these before step 0.2. Items with no column decided above are blocked on the question cited there.

1. **Lockout.** Concept p.7 says three failed attempts lock the account and alert Fitech. Concept p.48 alerts on 3 failed sign-ins. The brief says lockout after 5 failures for 15 minutes. Which rule is in force, and is the lock of the account, the device, or both?
2. **Role storage.** Is Role a table of four rows, or a Postgres enum on User? The brief lists both User and Role as entities.
3. **Role labels.** Should the database store the concept display labels (Branch manager, Inventory lead), or only the four codes?
4. **SameSite.** The brief says SameSite and does not say `Lax` or `Strict`.
5. **Idle timeout.** The duration is not stated. Neither is an absolute session lifetime.
6. **Step-up column.** The 5-minute passkey freshness rule needs a stored time. What is the column name, and is it on Session?
7. **User status.** What are the allowed values? The screen shows Active and Off shift. The same page says suspend, and says people with sales history are never deleted.
8. **Super admin.** Concept p.34 says the last active super admin cannot be removed or demoted. The brief has OWNER and no super-admin role. Is OWNER that account, and can more than one OWNER exist?
9. **Read-unlock permission key.** `costs.add` and `repairs.manage` are named. The temporary permission to *read* a buying price or cost is not named. What is the key?
10. **Standing grant expiry.** Does a standing `costs.add` or `repairs.manage` grant have no expiry, or an expiry like the read unlock?
11. **Grant columns.** What are the column names for the grantee, the approver, and the permission key? The approve screen also sends a code to the owner inbox (concept p.36). Is that code stored on the grant, and where?
12. **WebAuthn challenge.** The brief says the challenge is stored server-side and is single use. There is no Challenge entity in the phase 0 list. Where is it stored without adding a table?
13. **Passkey protocol columns.** Confirm that credential id, public key, and signature counter are the Passkey columns you want, under those names or under names you supply.
14. **Revoke.** Is a revoked passkey a flag, a timestamp, or a new append-only row? Concept p.6: revoke signs the phone out immediately. A new face added on the phone invalidates the key. Is that second case detectable on the server, or only by the user falling back to password?
15. **Trusted devices.** The staff screen lists phones and computers with labels. Is that list the Passkey rows, the Session rows, or a later table? Phase 0 does not list a TrustedDevice entity, so none was added.
16. **App PIN.** Concept p.6: 6 digits, stored only on the device, used when Face ID fails. The brief’s auth step does not mention it. Is PIN out of phase 0? It will not be a server column unless you say otherwise.
17. **argon2id parameters.** Memory, time, and parallelism are not stated.
18. **AuditLog shape.** Which of “what happened”, “to whom”, and “who asked what” belong to AuditLog, given the data map shares that line with Notification and AssistantChat? Is the on-screen “Activity” log the same table? What columns should step 0.2 create?
19. **Owner inboxes.** The brief says codes and alerts go to owner inboxes (plural). Concept p.50 says dedicated owner inbox addresses. Where is that list stored? Setting has no columns yet (Q41).
20. **pnpm version.** Not specified. This skeleton pins `pnpm@12.18.0` because that is what Corepack downloaded. Say if you want a different pin.
21. **New-device code.** “Box QR/serial” does not say which value becomes `code` when the QR and the serial differ, or what length and alphabet a New code has.
22. **IMEI length.** The document does not state a digit length. Should a check constraint wait until you set one?
23. **storage type.** Text (`128GB`) or an integer in GB?
24. **condition values.** Is the closed list `good` / `bad`, `broken` / `ready`, or something else?
25. **battery.** Integer percent, or text as printed on the label?
26. **status values.** Please list them. Words seen on screens and in the event list include in stock, borrowed, with dealer, reserved, sold, out for delivery, delivered, returned, locked, on hold. Those are not confirmed as the status enum.
27. **current location.** What is stored: a free-text place, a status-like code, or a reference to a person (rider, dealer, client)?
28. **Device origin field.** What is the column name for New / Ex-UK / trade-in / borrowed, and what are the exact values? “Borrowed” is used both for partner phones and in the code rule.
29. **Ex-UK label fields.** Confirm that part number, FMI, SIM, iOS version, and the label date are not Device columns in phase 0. The label date’s meaning is already an open decision on concept p.53.
30. **Selling price.** Every role can see it. The timeline cannot store amounts. The Device data-map list does not include it. Where does it live?
31. **DeviceEvent types.** Are the passport verbs (code generated, sent for repair, back in stock, listed) extra event types, or display text for the ten data-map types?
32. **DeviceEvent columns.** Please name the columns for device, event type, time, and actor. Confirm there is no amount column.
33. **DeviceCostEntry money column.** What is the column name and the numeric type (whole shillings, or a decimal)? Does the row also store the description and the external repairer shown on concept p.17, or does that wait for RepairJob?
34. **Currency.** Is every money column implicitly KES, with no currency column?
35. **Partner columns.** Which of `dealer`, `direction`, `due`, `settlement`, `swap` are columns on Partner? Which belong to a later consignment table? Are the screen’s phone number and place columns on Partner?
36. **Payment methods.** Is `card` a PaymentRecord method? The data map lists cash, M-Pesa, bank, and Lipa. The sale screens also list card. Is Lipa a payment method, or only a sale path whose deposit is cash / M-Pesa / bank / card?
37. **Owner tick.** M-Pesa and bank wait for the owner’s tick. The row cannot be updated. Is the tick a new PaymentRecord row, and what does that row contain?
38. **Payment amount.** What is the column name and numeric type for the amount on concept p.12?
39. **Payment and sale.** Sale is not a phase 0 entity. Does PaymentRecord have no sale reference until the selling phase?
40. **Recorded by.** Column name for the staff member who recorded the payment.
41. **Setting.** What columns, and which keys exist in phase 0? Lipa rates are still an open business decision (concept p.53), so they cannot be seeded.
42. **Primary keys and timestamps.** Not specified for any entity. Step 0.2 needs a decision: key type, and whether non-financial tables have a created-at time. Append-only tables cannot have an updated-at that changes.
43. **Shop column.** One shop (NUH) now, a branch later. Do phase 0 tables carry a shop id, or is that deferred with no column?
44. **Passkeys on computers.** Concept p.6 and p.7 say computer passkeys are a later release, and computers use password plus the emailed code until then. The brief makes passkeys the primary sign-in for the web app. Which rule applies to the desktop browser in phase 0?
45. **Sign-in sample.** Concept p.7 shows `victor@fitech.co.ke`. Other screens say their names and amounts are not real records. Is that email a real owner inbox or a mock? It will not be seeded either way until you say so.
46. **Devices that are not phones.** The data map says one Device per physical phone. Inventory screens include Mac, iPad, Watch, AirPods, and accessories. Are those Device rows in this phase?
47. **Package names.** The workspace packages are named `api`, `web`, and `shared`, matching the directories. Say if you want a scope such as `@fitech/api`.

## PROPOSED, NOT BUILT

- A README.
- npm scope `@fitech/*`.
- Snake-case SQL names (`device_event`, and so on) and plural versus singular table names.
- `uuid` primary keys and a `created_at` column. No `updated_at` on append-only tables.
- Migration directory `apps/api/migrations`.
- Env names, none of them written to `.env.example`: `DATABASE_URL`, `PORT`, `WEB_ORIGIN`, `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `SESSION_COOKIE_NAME`. Email transport names are not proposed because no email provider is named.
- A WebAuthn challenge table, a trusted-device table, and a catalog table for Model and variant.
- Entities the concept data map includes and this phase does not: Supplier, Receiving, TradeIn, RepairJob, Consignment, Sale, SaleItem, Delivery, Rider, Customer, ClientAccount, LipaPlan, Instalment, Expense, MarketingSpend, Payroll, Notification, AssistantChat.
- Server-side storage of the app PIN.
- Selling price, part number, FMI, SIM, version, and label date as Device columns.
- Installing Node 20 on this machine, or making a git commit.

## NOT DONE / GAPS

- Steps 0.2 through 0.6 are not started.
- No Drizzle schema, no SQL, no triggers, no seed.
- No Fastify app, no React app, no shared permission map, no auth.
- TypeScript, Fastify, Drizzle, React, Vite, Vitest, and Playwright are not installed.
- No test files exist. **0 tests passed, 0 tests failed.** The stub scripts `test`, `test:unit`, `test:leak`, and `test:e2e` each exited 1 because they are not implemented. That is not a test failure.
- This shell is Node v24.14.1. The repo asks for Node 20 via `.nvmrc` and `engines.node` = `20.x`. `pnpm install` and `pnpm install --config.engine-strict=true` both exited 0. With no dependencies, that check did not reject Node 24. Node 20 was not installed, so the pin is not proven on this machine.
- `pnpm` is not on `PATH`. Corepack was used.
- The Partner, PaymentRecord amount, Setting, Session, LoginAttempt, AuditLog, and PermissionGrant read-unlock designs are blocked on the questions above.
- No commit was created.

## Commands run

Working directory: `/Users/airm1/Projects/Fitech`.

`git init` (first command of the session that also printed the versions below):

```
Initialized empty Git repository in /Users/airm1/Projects/Fitech/.git/
```

```
$ node --version
v24.14.1

$ corepack --version
0.34.6

$ corepack pnpm --version
12.18.0

$ corepack pnpm install
Scope: all 4 workspace projects
Already up to date
Done in 48ms using pnpm v12.18.0

$ corepack pnpm install --config.engine-strict=true
Scope: all 4 workspace projects
Already up to date
Done in 4ms using pnpm v12.18.0
```

Stub scripts, each exit 1:

```
$ corepack pnpm run lint
$ node scripts/not-implemented.js 0.6 lint
lint: not implemented. Scheduled for step 0.6.
[ELIFECYCLE] Command failed with exit code 1.

$ corepack pnpm run typecheck
$ node scripts/not-implemented.js 0.6 typecheck
typecheck: not implemented. Scheduled for step 0.6.
[ELIFECYCLE] Command failed with exit code 1.

$ corepack pnpm run test
$ node scripts/not-implemented.js 0.2 test
test: not implemented. Scheduled for step 0.2.
[ELIFECYCLE] Test failed. See above for more details.

$ corepack pnpm run test:unit
$ node scripts/not-implemented.js 0.2 test:unit
test:unit: not implemented. Scheduled for step 0.2.
[ELIFECYCLE] Command failed with exit code 1.

$ corepack pnpm run test:leak
$ node scripts/not-implemented.js 0.5 test:leak
test:leak: not implemented. Scheduled for step 0.5.
[ELIFECYCLE] Command failed with exit code 1.

$ corepack pnpm run test:e2e
$ node scripts/not-implemented.js 0.6 test:e2e
test:e2e: not implemented. Scheduled for step 0.6.
[ELIFECYCLE] Command failed with exit code 1.

$ corepack pnpm run build
$ node scripts/not-implemented.js 0.6 build
build: not implemented. Scheduled for step 0.6.
[ELIFECYCLE] Command failed with exit code 1.

$ corepack pnpm run dev:api
$ node scripts/not-implemented.js 0.2 dev:api
dev:api: not implemented. Scheduled for step 0.2.
[ELIFECYCLE] Command failed with exit code 1.

$ corepack pnpm run dev:web
$ node scripts/not-implemented.js 0.6 dev:web
dev:web: not implemented. Scheduled for step 0.6.
[ELIFECYCLE] Command failed with exit code 1.
```

`engines` field read from `package.json` on this machine:

```
{ node: '20.x' }
```

`git status --short` before this report file existed:

```
?? .env.example
?? .gitignore
?? .nvmrc
?? apps/
?? package.json
?? packages/
?? pnpm-lock.yaml
?? pnpm-workspace.yaml
?? scripts/
?? tsconfig.base.json
```

Tree command, run after this file was added. Output matches the Folder tree section above. `node_modules/` and `.git/` were pruned.

```
$ find . -path './.git' -prune -o -path './node_modules' -prune -o -print | sort
.
./.env.example
./.gitignore
./.nvmrc
./apps
./apps/api
./apps/api/package.json
./apps/api/tsconfig.json
./apps/web
./apps/web/package.json
./apps/web/tsconfig.json
./docs
./docs/phase0
./docs/phase0/STEP-0.1-REPORT.md
./package.json
./packages
./packages/shared
./packages/shared/package.json
./packages/shared/tsconfig.json
./pnpm-lock.yaml
./pnpm-workspace.yaml
./scripts
./scripts/not-implemented.js
./tsconfig.base.json
```

## Tests

No test runner is installed and no test files exist.

- Passed: 0
- Failed: 0
- Stub script exits: `test`, `test:unit`, `test:leak`, and `test:e2e` each exited 1, as shown above. They do not execute assertions.
