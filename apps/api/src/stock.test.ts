import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import argon2 from "argon2";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { listStock } from "./stock.js";

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

describe("stock for a sale", () => {
  it("returns in-stock variants of the name and leaves out sold or locked phones", async () => {
    const stamp = randomUUID().slice(0, 8);
    const model = `Stock ${stamp}`;
    await sql`
      insert into device (code, imei, model, colour, storage, status, origin)
      values
        (${`${stamp}-black`}, ${`${stamp}1111111`}, ${model}, 'Black', '128GB', 'in stock', 'new'),
        (${`${stamp}-blue`}, ${`${stamp}2222222`}, ${model}, 'Blue', '256GB', 'in stock', 'new'),
        (${`${stamp}-sold`}, ${`${stamp}3333333`}, ${model}, 'Red', '128GB', 'sold', 'new'),
        (${`${stamp}-lock`}, ${`${stamp}4444444`}, ${model}, 'Gold', '128GB', 'locked', 'new')
    `;

    const stock = await listStock(sql, model);
    expect(stock.map((unit) => unit.colour).sort()).toEqual(["Black", "Blue"]);
    expect(stock.find((unit) => unit.colour === "Black")?.storage).toBe("128GB");
    expect(stock.find((unit) => unit.colour === "Blue")?.storage).toBe("256GB");
    expect(stock.some((unit) => "cost" in unit)).toBe(false);

    await sql`delete from device where model = ${model}`;
  });

  it("requires a signed-in person", async () => {
    const hidden = await app.inject({ method: "GET", url: "/api/stock?name=phone" });
    expect(hidden.statusCode).toBe(401);

    const email = `stock-${randomUUID()}@fitech.test`;
    const roles = await sql<{ id: string }[]>`select id from role where code = 'CASHIER'`;
    const role = roles[0];
    if (!role) {
      throw new Error("CASHIER role missing");
    }
    const passwordHash = await argon2.hash("Stock-pass-1", {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    await sql`
      insert into app_user (name, email, password_hash, role_id, status)
      values ('Stock cashier', ${email}, ${passwordHash}, ${role.id}, 'Active')
    `;
    const password = await app.inject({
      method: "POST",
      url: "/api/auth/password",
      payload: { email, password: "Stock-pass-1" },
    });
    const code = password.json().devCode as string;
    const signedIn = await app.inject({
      method: "POST",
      url: "/api/auth/code",
      payload: { email, code },
    });
    const cookie = signedIn.headers["set-cookie"];
    const listed = await app.inject({
      method: "GET",
      url: "/api/stock?name=",
      headers: { cookie: Array.isArray(cookie) ? cookie : cookie ?? "" },
    });
    expect(listed.statusCode).toBe(200);
    expect(Array.isArray(listed.json().stock)).toBe(true);
  });
});
