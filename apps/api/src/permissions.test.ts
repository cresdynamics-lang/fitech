import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  READ_UNLOCK_MAX_MS,
  READ_UNLOCK_MIN_MS,
  canRecordOwnerLedger,
  canSeeFinance,
  filterFinance,
  readUnlockDurationAllowed,
} from "shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasStandingWrite } from "./permissions.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const sql = postgres(databaseUrl, { max: 1 });

beforeAll(async () => {
  const db = drizzle(sql);
  const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
  await migrate(db, { migrationsFolder: folder });
});

afterAll(async () => {
  await sql.end();
});

const sample = {
  model: "iPhone",
  "buying price": 90000,
  profit: 10000,
  margin: 10,
  expenses: 500,
  payroll: 20000,
  "stock value": 400000,
  "Lipa totals": 15000,
  cost: { kind: "purchase", amountKes: 80000, note: "box" },
  lines: [{ kind: "freight", amount_kes: 2000, place: "Nairobi" }],
  payment: { method: "cash", amountKes: 95000 },
};

describe("finance filter", () => {
  it("keeps finance figures for the owner", () => {
    expect(canSeeFinance("OWNER")).toBe(true);
    expect(filterFinance("OWNER", sample)).toEqual(sample);
    expect(canRecordOwnerLedger("OWNER")).toBe(true);
  });

  it("removes finance figures for every other role", () => {
    for (const role of ["MANAGER", "CASHIER", "INVENTORY"]) {
      expect(canSeeFinance(role)).toBe(false);
      expect(canRecordOwnerLedger(role)).toBe(false);
      expect(filterFinance(role, sample)).toEqual({
        model: "iPhone",
        lines: [{ kind: "freight", place: "Nairobi" }],
        payment: { method: "cash", amountKes: 95000 },
      });
    }
  });

  it("does not treat a standing write grant as permission to read", async () => {
    const roles = await sql<{ id: string }[]>`select id from role where code = 'CASHIER'`;
    const role = roles[0];
    if (!role) {
      throw new Error("CASHIER role missing");
    }
    const email = `grant.${randomUUID()}@fitech.test`;
    const users = await sql<{ id: string }[]>`
      insert into app_user (name, email, password_hash, role_id, status)
      values ('Grant test', ${email}, 'not-a-login', ${role.id}, 'Active')
      returning id
    `;
    const userId = users[0]?.id;
    if (!userId) {
      throw new Error("user was not inserted");
    }
    await sql`
      insert into permission_grant (user_id, permission_key)
      values (${userId}, 'costs.add')
    `;

    expect(await hasStandingWrite(sql, userId, "costs.add")).toBe(true);
    expect(await hasStandingWrite(sql, userId, "repairs.manage")).toBe(false);
    expect(await hasStandingWrite(sql, userId, "cost")).toBe(false);
    expect(filterFinance("CASHIER", sample).cost).toBeUndefined();
    expect(filterFinance("CASHIER", sample).lines).toEqual([{ kind: "freight", place: "Nairobi" }]);
  });

  it("accepts a read window from 5 minutes through 8 hours", () => {
    expect(readUnlockDurationAllowed(READ_UNLOCK_MIN_MS)).toBe(true);
    expect(readUnlockDurationAllowed(READ_UNLOCK_MIN_MS - 1)).toBe(false);
    expect(readUnlockDurationAllowed(READ_UNLOCK_MAX_MS)).toBe(true);
    expect(readUnlockDurationAllowed(READ_UNLOCK_MAX_MS + 1)).toBe(false);
  });
});
