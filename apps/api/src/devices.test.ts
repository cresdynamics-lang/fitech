import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { devicePassport, listDevices } from "./devices.js";

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

describe("device list", () => {
  it("lists a phone without a cost figure and refuses a stranger", async () => {
    const stamp = randomUUID().slice(0, 8);
    const code = `${stamp}-gold`;
    const inserted = await sql<{ id: string }[]>`
      insert into device (code, imei, model, colour, storage, status, origin)
      values (${code}, ${`${stamp}3333333`}, 'Test phone', 'Gold', '256GB', 'in stock', 'new')
      returning id
    `;
    const listed = await listDevices(sql, stamp);
    expect(listed.some((phone) => phone.code === code)).toBe(true);
    expect(JSON.stringify(listed)).not.toContain("amountKes");
    const passport = await devicePassport(sql, inserted[0]?.id ?? "");
    expect(passport?.imei).toBe(`${stamp}3333333`);
    expect(JSON.stringify(passport)).not.toContain("amountKes");
    const response = await app.inject({ method: "GET", url: "/api/devices" });
    expect(response.statusCode).toBe(401);
    await sql`delete from device where code = ${code}`;
  });
});
