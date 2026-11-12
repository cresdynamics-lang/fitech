# STEP 0.4 REPORT — Permissions and finance filter

Status: **STOP.** Step 0.5 does not start until you reply `APPROVED STEP 0.4`.

A person who is not the OWNER does not receive cost, buying price, profit, margin, expenses, payroll, stock value, or Lipa totals. `costs.add` and `repairs.manage` can allow a write. They do not reveal those figures. Vitest: **15 passed, 0 failed.**

## What was built

- `filterFinance` removes the owner-only figures from a value, including nested ones. An OWNER receives the value unchanged.
- A cost entry also loses `amountKes` and `amount_kes` for every other role. A payment amount stays, because staff record payments.
- `canRecordOwnerLedger` is true only for OWNER. That is the check for expenses, marketing spend, and salaries. No expense table was added.
- `hasStandingWrite` is true only for `costs.add` or `repairs.manage`, and only while the grant has no expiry or the expiry is still ahead.
- A read window is accepted only from 5 minutes through 8 hours. The permission key for that read is still not named, so no read grant is created.

## Commands

```
$ corepack pnpm --filter api test

 RUN  v5.1.0 /Users/airm1/Projects/Fitech/apps/api

 Test Files  3 passed (3)
      Tests  15 passed (15)
   Start at  09:44:23
   Duration  2.70s (import 70%, tests 27%, transform 2%)

$ corepack pnpm typecheck
shared, api, and web: tsc --noEmit, exit 0
```

The 15 tests are the previous 5 append-only tests, the 6 auth tests, and these 4 permission tests.

## Files changed

| Path | What it is |
| --- | --- |
| `packages/shared/src/index.ts` | Finance filter and the owner checks |
| `apps/api/src/permissions.ts` | Standing write lookup |
| `apps/api/src/permissions.test.ts` | The 4 new tests |
| `docs/phase0/STEP-0.4-REPORT.md` | This report |

## NOT DONE / GAPS

- The temporary permission to read a cost has no name. The 5-minute to 8-hour window is checked, and no grant of that read is stored. Question remains: what is the key?
- Whether a standing `costs.add` or `repairs.manage` grant expires is still open. A grant with an empty expiry is treated as still valid.
- There is no Sale table, so “a cost may be added during a sale” is not enforced.
- Expenses, marketing spend, and salaries have no table. Only OWNER passes the check. Nothing is stored.
- The Today page is not built.
- This step was not committed.
