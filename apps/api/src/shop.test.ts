import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import argon2 from "argon2";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { hasStandingWrite } from "./permissions.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const sql = postgres(databaseUrl, { max: 1 });
const built = await buildApp(databaseUrl);
const app = built.app;

beforeAll(async () => {
  const db = drizzle(sql);
  const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
  await migrate(db, { migrationsFolder: folder });
});

afterAll(async () => {
  await sql.end();
  await app.close();
});

async function signIn(roleCode: string): Promise<{ cookie: string; email: string; userId: string }> {
  const email = `${roleCode.toLowerCase()}-${randomUUID()}@fitech.test`;
  const roles = await sql<{ id: string }[]>`select id from role where code = ${roleCode}`;
  const role = roles[0];
  if (!role) {
    throw new Error(`${roleCode} role missing`);
  }
  const passwordHash = await argon2.hash("Shop-pass-1", {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const users = await sql<{ id: string }[]>`
    insert into app_user (name, email, password_hash, role_id, status)
    values (${roleCode}, ${email}, ${passwordHash}, ${role.id}, 'Active')
    returning id
  `;
  const user = users[0];
  if (!user) {
    throw new Error("user missing");
  }
  const password = await app.inject({
    method: "POST",
    url: "/api/auth/password",
    payload: { email, password: "Shop-pass-1" },
  });
  const code = password.json().devCode as string;
  const signedIn = await app.inject({
    method: "POST",
    url: "/api/auth/code",
    payload: { email, code },
  });
  const header = signedIn.headers["set-cookie"];
  const cookie = Array.isArray(header) ? header.join("; ") : (header ?? "");
  return { cookie, email, userId: user.id };
}

async function json(method: "GET" | "POST", url: string, cookie: string, payload?: Record<string, string | boolean>) {
  return await app.inject({ method, url, headers: { cookie }, payload });
}

describe("partner source and staff", () => {
  it("borrows a phone from a partner and keeps that partner as the source", async () => {
    const manager = await signIn("MANAGER");
    const cashier = await signIn("CASHIER");
    const inventory = await signIn("INVENTORY");
    const denied = await json("POST", "/api/partners", cashier.cookie, { dealer: "No" });
    expect(denied.statusCode).toBe(403);

    const created = await json("POST", "/api/partners", manager.cookie, {
      dealer: `Dealer ${cashier.userId.slice(0, 8)}`,
      phone: "0700000000",
      place: "Luthuli Ave",
    });
    expect(created.statusCode).toBe(200);
    const partnerId = created.json().partner.id as string;

    const blocked = await json("POST", "/api/stock/borrow", inventory.cookie, {
      partnerId,
      model: "iPhone",
      colour: "Black",
      storage: "128GB",
      imei: "359000000000009",
    });
    expect(blocked.statusCode).toBe(403);

    const borrowed = await json("POST", "/api/stock/borrow", cashier.cookie, {
      partnerId,
      model: `Borrow ${cashier.userId.slice(0, 8)}`,
      colour: "Black",
      storage: "256GB",
      condition: "good",
      imei: "359000000000009",
      due: "12 Nov",
    });
    expect(borrowed.statusCode).toBe(200);
    const phone = borrowed.json().phone as { code: string; source: string; model: string };
    expect(phone.code).toMatch(/^[0-9]{13}$/);
    expect(phone.source).toContain("Dealer");

    const stock = await json("GET", `/api/stock?name=${encodeURIComponent(phone.model)}`, cashier.cookie);
    expect(stock.statusCode).toBe(200);
    const listed = stock.json().stock as { code: string; source: string; colour: string }[];
    expect(listed).toEqual([
      expect.objectContaining({ code: phone.code, source: phone.source, colour: "Black" }),
    ]);
    expect(listed.some((unit) => "cost" in unit)).toBe(false);

    const partners = await json("GET", "/api/partners", cashier.cookie);
    const body = partners.json() as { borrowed: { code: string; source: string; due: string }[] };
    expect(body.borrowed.some((row) => row.code === phone.code && row.due === "12 Nov")).toBe(true);
  });

  it("lets the owner grant a standing write and refuses a finance switch", async () => {
    const owner = await signIn("OWNER");
    const cashier = await signIn("CASHIER");
    const manager = await signIn("MANAGER");

    const hidden = await json("GET", "/api/staff", cashier.cookie);
    expect(hidden.statusCode).toBe(403);

    const seen = await json("GET", "/api/staff", manager.cookie);
    expect(seen.statusCode).toBe(200);
    expect(Array.isArray(seen.json().people)).toBe(true);

    const managerGrant = await json("POST", `/api/staff/${cashier.userId}/grants`, manager.cookie, {
      key: "costs.add",
      enabled: true,
    });
    expect(managerGrant.statusCode).toBe(403);

    const finance = await json("POST", `/api/staff/${cashier.userId}/grants`, owner.cookie, {
      key: "profit",
      enabled: true,
    });
    expect(finance.statusCode).toBe(400);

    const granted = await json("POST", `/api/staff/${cashier.userId}/grants`, owner.cookie, {
      key: "costs.add",
      enabled: true,
    });
    expect(granted.statusCode).toBe(200);
    expect(await hasStandingWrite(sql, cashier.userId, "costs.add")).toBe(true);

    const ended = await json("POST", `/api/staff/${cashier.userId}/grants`, owner.cookie, {
      key: "costs.add",
      enabled: false,
    });
    expect(ended.statusCode).toBe(200);
    expect(await hasStandingWrite(sql, cashier.userId, "costs.add")).toBe(false);

    await sql`
      insert into known_device (user_id, token_hash)
      values (${cashier.userId}, ${randomUUID()})
    `;
    const devices = await sql<{ id: string }[]>`
      select id from known_device where user_id = ${cashier.userId} and revoked_at is null
    `;
    const device = devices[0];
    if (!device) {
      throw new Error("device missing");
    }
    const revoked = await json("POST", `/api/staff/${cashier.userId}/devices/${device.id}/revoke`, owner.cookie);
    expect(revoked.statusCode).toBe(200);
    const still = await sql<{ id: string }[]>`
      select id from known_device where id = ${device.id} and revoked_at is null
    `;
    expect(still).toHaveLength(0);
  });
});
