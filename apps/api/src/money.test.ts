import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { moneyPicture } from "./money.js";

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

describe("owner money picture", () => {
  it("does not invent a figure when nothing is recorded", async () => {
    const picture = await moneyPicture(sql, "month");
    expect(picture.salesMade).toBeNull();
    expect(picture.profit.netProfit).toBeNull();
    expect(picture.moneyOut.rent).toBeNull();
    expect(picture.lipaOutstanding).toBeNull();
  });

  it("is refused to anyone who is not the owner", async () => {
    const hidden = await app.inject({ method: "GET", url: "/api/money" });
    expect(hidden.statusCode).toBe(401);

    const email = `money-${randomUUID()}@fitech.test`;
    const roles = await sql<{ id: string }[]>`select id from role where code = 'CASHIER'`;
    const role = roles[0];
    if (!role) {
      throw new Error("CASHIER role missing");
    }
    const passwordHash = await argon2.hash("Money-pass-1", {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    await sql`
      insert into app_user (name, email, password_hash, role_id, status)
      values ('Money cashier', ${email}, ${passwordHash}, ${role.id}, 'Active')
    `;
    const password = await app.inject({
      method: "POST",
      url: "/api/auth/password",
      payload: { email, password: "Money-pass-1" },
    });
    const signedIn = await app.inject({
      method: "POST",
      url: "/api/auth/code",
      payload: { email, code: password.json().devCode },
    });
    const cookie = signedIn.headers["set-cookie"];
    const refused = await app.inject({
      method: "GET",
      url: "/api/money",
      headers: { cookie: Array.isArray(cookie) ? cookie.join("; ") : (cookie ?? "") },
    });
    expect(refused.statusCode).toBe(403);
  });
});
