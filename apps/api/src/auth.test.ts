import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import argon2 from "argon2";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const sql = postgres(databaseUrl, { max: 1 });
const built = await buildApp(databaseUrl);
const app = built.app;

function cookieNamed(setCookie: string | string[] | undefined, name: string): string {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const line = list.find((item) => item.startsWith(`${name}=`));
  return line?.split(";")[0] ?? "";
}

function sessionCookie(setCookie: string | string[] | undefined): string {
  return cookieNamed(setCookie, "fitech_session");
}

async function createUser(email: string, password: string) {
  const roles = await sql<{ id: string }[]>`select id from role where code = 'CASHIER'`;
  const role = roles[0];
  if (!role) {
    throw new Error("CASHIER role missing");
  }
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  await sql`
    insert into app_user (name, email, password_hash, role_id, status)
    values ('Auth test', ${email}, ${passwordHash}, ${role.id}, 'Active')
  `;
}

beforeAll(async () => {
  const db = drizzle(sql);
  const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
  await migrate(db, { migrationsFolder: folder });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await sql.end();
});

describe("auth", () => {
  it("locks the account after 3 failed sign-ins", async () => {
    const email = `lock.${randomUUID()}@fitech.test`;
    const password = "correct-password";
    await createUser(email, password);

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const wrong = await app.inject({
        method: "POST",
        url: "/api/auth/password",
        payload: { email, password: "wrong-password" },
      });
      expect(wrong.statusCode).toBe(401);
    }

    const third = await app.inject({
      method: "POST",
      url: "/api/auth/password",
      payload: { email, password: "wrong-password" },
    });
    expect(third.statusCode).toBe(423);
    expect(third.json()).toEqual({ error: "This account is locked after 3 failed sign-ins." });

    const after = await app.inject({
      method: "POST",
      url: "/api/auth/password",
      payload: { email, password },
    });
    expect(after.statusCode).toBe(423);
  });

  it("rejects an expired 6-digit code", async () => {
    const email = `code.${randomUUID()}@fitech.test`;
    const password = "correct-password";
    await createUser(email, password);

    const issued = await app.inject({
      method: "POST",
      url: "/api/auth/password",
      payload: { email, password },
    });
    expect(issued.statusCode).toBe(200);
    const body = issued.json() as { needsCode: boolean; devCode: string };
    expect(body.needsCode).toBe(true);

    await sql`
      update login_code
      set expires_at = now() - interval '1 minute'
      where user_id = (select id from app_user where email = ${email})
    `;

    const expired = await app.inject({
      method: "POST",
      url: "/api/auth/code",
      payload: { email, code: body.devCode },
    });
    expect(expired.statusCode).toBe(401);
    expect(expired.json()).toEqual({ error: "That code has expired." });
  });

  it("revokes every session when a rotated session is reused", async () => {
    const email = `reuse.${randomUUID()}@fitech.test`;
    const password = "correct-password";
    await createUser(email, password);

    const issued = await app.inject({
      method: "POST",
      url: "/api/auth/password",
      payload: { email, password, requireCode: true },
    });
    const code = (issued.json() as { devCode: string }).devCode;
    const signedIn = await app.inject({
      method: "POST",
      url: "/api/auth/code",
      payload: { email, code },
    });
    expect(signedIn.statusCode).toBe(200);
    const firstCookie = sessionCookie(signedIn.headers["set-cookie"]);
    expect(firstCookie.startsWith("fitech_session=")).toBe(true);

    const rotated = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { cookie: firstCookie },
    });
    expect(rotated.statusCode).toBe(200);
    const secondCookie = sessionCookie(rotated.headers["set-cookie"]);

    const reused = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { cookie: firstCookie },
    });
    expect(reused.statusCode).toBe(401);
    expect(reused.json()).toEqual({
      error: "This session was reused. Every session for the account was signed out.",
    });

    const after = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: secondCookie },
    });
    expect(after.statusCode).toBe(401);
  });

  it("rejects a passkey step-up older than 5 minutes", async () => {
    const email = `step.${randomUUID()}@fitech.test`;
    const password = "correct-password";
    await createUser(email, password);
    const issued = await app.inject({
      method: "POST",
      url: "/api/auth/password",
      payload: { email, password, requireCode: true },
    });
    const code = (issued.json() as { devCode: string }).devCode;
    const signedIn = await app.inject({
      method: "POST",
      url: "/api/auth/code",
      payload: { email, code },
    });
    const cookie = sessionCookie(signedIn.headers["set-cookie"]);

    const missing = await app.inject({
      method: "GET",
      url: "/api/auth/step-up",
      headers: { cookie },
    });
    expect(missing.statusCode).toBe(403);

    await sql`
      update session
      set step_up_at = now()
      where user_id = (select id from app_user where email = ${email})
    `;
    const fresh = await app.inject({
      method: "GET",
      url: "/api/auth/step-up",
      headers: { cookie },
    });
    expect(fresh.statusCode).toBe(200);

    await sql`
      update session
      set step_up_at = now() - interval '6 minutes'
      where user_id = (select id from app_user where email = ${email})
    `;
    const stale = await app.inject({
      method: "GET",
      url: "/api/auth/step-up",
      headers: { cookie },
    });
    expect(stale.statusCode).toBe(403);
    expect(stale.json()).toEqual({
      error: "Confirm with this device. The last check was more than 5 minutes ago.",
    });
  });

  it("unlocks a known device with the right PIN and rejects a wrong PIN", async () => {
    const email = `pin.${randomUUID()}@fitech.test`;
    await createUser(email, "correct-password");
    const issued = await app.inject({
      method: "POST",
      url: "/api/auth/setup",
      payload: { email },
    });
    expect(issued.statusCode).toBe(200);
    const code = (issued.json() as { devCode: string }).devCode;
    const confirmed = await app.inject({
      method: "POST",
      url: "/api/auth/code",
      payload: { email, code },
    });
    expect(confirmed.statusCode).toBe(200);
    const device = cookieNamed(confirmed.headers["set-cookie"], "fitech_device");
    const session = sessionCookie(confirmed.headers["set-cookie"]);

    const setup = await app.inject({
      method: "POST",
      url: "/api/auth/pin/setup",
      headers: { cookie: `${device}; ${session}` },
      payload: { pin: "123456" },
    });
    expect(setup.statusCode).toBe(200);

    await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie: session },
    });

    const wrong = await app.inject({
      method: "POST",
      url: "/api/auth/pin",
      headers: { cookie: device },
      payload: { pin: "000000" },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toEqual({ error: "Wrong PIN." });

    const right = await app.inject({
      method: "POST",
      url: "/api/auth/pin",
      headers: { cookie: device },
      payload: { pin: "123456" },
    });
    expect(right.statusCode).toBe(200);
    expect((right.json() as { user: { email: string } }).user.email).toBe(email);
  });

  it("asks a known device for a platform passkey", async () => {
    const email = `enroll.${randomUUID()}@fitech.test`;
    await createUser(email, "correct-password");
    const issued = await app.inject({
      method: "POST",
      url: "/api/auth/setup",
      payload: { email },
    });
    const code = (issued.json() as { devCode: string }).devCode;
    const confirmed = await app.inject({
      method: "POST",
      url: "/api/auth/code",
      payload: { email, code },
    });
    const device = cookieNamed(confirmed.headers["set-cookie"], "fitech_device");

    const missing = await app.inject({
      method: "POST",
      url: "/api/auth/passkey/enroll/options",
    });
    expect(missing.statusCode).toBe(401);

    const options = await app.inject({
      method: "POST",
      url: "/api/auth/passkey/enroll/options",
      headers: { cookie: device },
    });
    expect(options.statusCode).toBe(200);
    const body = options.json() as {
      challenge: string;
      authenticatorSelection: { authenticatorAttachment: string; userVerification: string };
    };
    expect(body.challenge).toEqual(expect.any(String));
    expect(body.authenticatorSelection.authenticatorAttachment).toBe("platform");
    expect(body.authenticatorSelection.userVerification).toBe("required");
  });
});
