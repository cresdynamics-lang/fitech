import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { drizzle } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";
import {
  CHALLENGE_TTL_MS,
  codeSignInSchema,
  deviceSetupSchema,
  EMAIL_CODE_TTL_MS,
  LOGIN_FAILURES_BEFORE_LOCK,
  passwordSignInSchema,
  pinSchema,
  STEP_UP_TTL_MS,
} from "shared";

const RP_NAME = "Fitech";
const RP_ID = process.env.WEBAUTHN_RP_ID ?? "localhost";
const ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";
const SESSION_COOKIE = "fitech_session";
const DEVICE_COOKIE = "fitech_device";

type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  status: string;
  role_code: string;
};

class AuthError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.COOKIE_SECURE === "true",
  };
}

async function writeAudit(
  sql: Sql,
  whatHappened: string,
  toWhom: string | null,
  whoAskedUserId: string | null,
) {
  await sql`
    insert into audit_log (what_happened, to_whom, who_asked_user_id)
    values (${whatHappened}, ${toWhom}, ${whoAskedUserId})
  `;
}

async function recordAttempt(sql: Sql, email: string, userId: string | null, succeeded: boolean) {
  await sql`
    insert into login_attempt (user_id, email, succeeded)
    values (${userId}, ${email}, ${succeeded})
  `;
}

async function isLocked(sql: Sql, email: string): Promise<boolean> {
  const rows = await sql<{ succeeded: boolean }[]>`
    select succeeded
    from login_attempt
    where email = ${email}
    order by created_at desc
    limit 20
  `;
  let failures = 0;
  for (const row of rows) {
    if (row.succeeded) {
      break;
    }
    failures += 1;
  }
  return failures >= LOGIN_FAILURES_BEFORE_LOCK;
}

async function findUser(sql: Sql, email: string): Promise<UserRow | undefined> {
  const rows = await sql<UserRow[]>`
    select u.id, u.name, u.email, u.password_hash, u.status, r.code as role_code
    from app_user u
    join role r on r.id = u.role_id
    where lower(u.email) = lower(${email})
  `;
  return rows[0];
}

type RecognisedDevice = {
  name: string;
  email: string;
  hasPasskey: boolean;
  hasPin: boolean;
};

async function findRecognised(
  sql: Sql,
  deviceToken: string | undefined,
): Promise<RecognisedDevice | undefined> {
  if (!deviceToken) {
    return undefined;
  }
  const rows = await sql<{ name: string; email: string; has_passkey: boolean; has_pin: boolean }[]>`
    select u.name, u.email,
      exists (
        select 1 from passkey p
        where p.user_id = u.id and p.revoked_at is null
      ) as has_passkey,
      d.pin_hash is not null as has_pin
    from known_device d
    join app_user u on u.id = d.user_id
    where d.token_hash = ${sha256(deviceToken)}
      and d.revoked_at is null
      and u.status = 'Active'
  `;
  const row = rows[0];
  if (!row) {
    return undefined;
  }
  return {
    name: row.name,
    email: row.email,
    hasPasskey: row.has_passkey,
    hasPin: row.has_pin,
  };
}

async function deviceIsKnown(sql: Sql, userId: string, deviceToken: string | undefined) {
  if (!deviceToken) {
    return false;
  }
  const rows = await sql<{ id: string }[]>`
    select id from known_device
    where user_id = ${userId}
      and token_hash = ${sha256(deviceToken)}
      and revoked_at is null
  `;
  return rows.length > 0;
}

async function rememberDevice(sql: Sql, reply: FastifyReply, userId: string) {
  const token = newToken();
  await sql`
    insert into known_device (user_id, token_hash)
    values (${userId}, ${sha256(token)})
  `;
  reply.setCookie(DEVICE_COOKIE, token, cookieOptions());
}

async function openSession(
  sql: Sql,
  reply: FastifyReply,
  user: UserRow,
  stepUp: boolean,
) {
  const token = newToken();
  await sql`
    insert into session (user_id, token_hash, step_up_at)
    values (${user.id}, ${sha256(token)}, ${stepUp ? new Date() : null})
  `;
  reply.setCookie(SESSION_COOKIE, token, cookieOptions());
  await recordAttempt(sql, user.email, user.id, true);
  await writeAudit(sql, "sign-in", user.email, user.id);
  return publicUser(user);
}

function publicUser(user: UserRow) {
  return { id: user.id, name: user.name, email: user.email, role: user.role_code };
}

async function failSignIn(sql: Sql, email: string, userId: string | null, whatHappened: string) {
  await recordAttempt(sql, email, userId, false);
  await writeAudit(sql, whatHappened, email, userId);
  if (await isLocked(sql, email)) {
    await writeAudit(sql, "account locked", email, userId);
    throw new AuthError(423, "This account is locked after 3 failed sign-ins.");
  }
}

async function saveChallenge(
  sql: Sql,
  challenge: string,
  purpose: string,
  userId: string | null,
) {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await sql`
    insert into webauthn_challenge (challenge, user_id, purpose, expires_at)
    values (${challenge}, ${userId}, ${purpose}, ${expiresAt})
  `;
}

async function consumeChallenge(sql: Sql, challenge: string, purpose: string) {
  const rows = await sql<{ id: string; user_id: string | null; expires_at: Date; used_at: Date | null }[]>`
    select id, user_id, expires_at, used_at
    from webauthn_challenge
    where challenge = ${challenge} and purpose = ${purpose}
  `;
  const row = rows[0];
  if (!row || row.used_at) {
    throw new AuthError(400, "That sign-in challenge has already been used.");
  }
  if (row.expires_at.getTime() <= Date.now()) {
    throw new AuthError(400, "That sign-in challenge has expired.");
  }
  await sql`update webauthn_challenge set used_at = now() where id = ${row.id}`;
  return row;
}

type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  previous_token_hash: string | null;
  step_up_at: Date | null;
  revoked_at: Date | null;
};

async function revokeAllSessions(sql: Sql, userId: string) {
  await sql`
    update session
    set revoked_at = now()
    where user_id = ${userId} and revoked_at is null
  `;
}

async function readSession(sql: Sql, token: string | undefined): Promise<SessionRow> {
  if (!token) {
    throw new AuthError(401, "Sign in required.");
  }
  const hash = sha256(token);
  const current = await sql<SessionRow[]>`
    select id, user_id, token_hash, previous_token_hash, step_up_at, revoked_at
    from session
    where token_hash = ${hash} and revoked_at is null
  `;
  if (current[0]) {
    return current[0];
  }
  const reused = await sql<{ user_id: string }[]>`
    select user_id from session where previous_token_hash = ${hash}
  `;
  if (reused[0]) {
    await revokeAllSessions(sql, reused[0].user_id);
    await writeAudit(sql, "session reuse revoked all sessions", null, reused[0].user_id);
    throw new AuthError(401, "This session was reused. Every session for the account was signed out.");
  }
  throw new AuthError(401, "Sign in required.");
}

export async function buildApp(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 10 });
  const app = Fastify({ logger: false });
  await app.register(cookie);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    app.log.error(error);
    return reply.code(500).send({ error: "Something went wrong." });
  });

  app.get("/api/health", async () => ({ ok: true }));

  app.post("/api/auth/password", async (request, reply) => {
    const parsed = passwordSignInSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AuthError(400, "Enter a valid email and password.");
    }
    const { email, password, requireCode } = parsed.data;
    if (await isLocked(sql, email)) {
      await writeAudit(sql, "sign-in rejected, account locked", email, null);
      throw new AuthError(423, "This account is locked after 3 failed sign-ins.");
    }
    const user = await findUser(sql, email);
    const passwordOk = user ? await argon2.verify(user.password_hash, password) : false;
    if (!user || !passwordOk || user.status !== "Active") {
      await failSignIn(sql, email, user?.id ?? null, "sign-in failed");
      throw new AuthError(401, "Email or password is wrong.");
    }
    const known = await deviceIsKnown(sql, user.id, request.cookies[DEVICE_COOKIE]);
    if (!requireCode && known) {
      const signedIn = await openSession(sql, reply, user, false);
      return { user: signedIn };
    }
    const code = sixDigitCode();
    const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MS);
    await sql`
      insert into login_code (user_id, code_hash, expires_at)
      values (${user.id}, ${sha256(code)}, ${expiresAt})
    `;
    await writeAudit(sql, "sign-in code issued", user.email, user.id);
    console.log(`sign-in code for ${user.email}: ${code}`);
    return {
      needsCode: true,
      devCode: process.env.NODE_ENV === "production" ? undefined : code,
    };
  });

  app.post("/api/auth/code", async (request, reply) => {
    const parsed = codeSignInSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AuthError(400, "Enter the 6-digit code.");
    }
    const { email, code } = parsed.data;
    if (await isLocked(sql, email)) {
      throw new AuthError(423, "This account is locked after 3 failed sign-ins.");
    }
    const user = await findUser(sql, email);
    if (!user) {
      await failSignIn(sql, email, null, "sign-in code failed");
      throw new AuthError(401, "That code is wrong.");
    }
    const codes = await sql<{ id: string; code_hash: string; expires_at: Date }[]>`
      select id, code_hash, expires_at
      from login_code
      where user_id = ${user.id} and used_at is null
      order by created_at desc
      limit 1
    `;
    const row = codes[0];
    if (!row || !hashesMatch(row.code_hash, sha256(code))) {
      await failSignIn(sql, email, user.id, "sign-in code failed");
      throw new AuthError(401, "That code is wrong.");
    }
    await sql`update login_code set used_at = now() where id = ${row.id}`;
    if (row.expires_at.getTime() <= Date.now()) {
      await failSignIn(sql, email, user.id, "sign-in code expired");
      throw new AuthError(401, "That code has expired.");
    }
    if (!(await deviceIsKnown(sql, user.id, request.cookies[DEVICE_COOKIE]))) {
      await rememberDevice(sql, reply, user.id);
    }
    const signedIn = await openSession(sql, reply, user, false);
    return { user: signedIn };
  });

  app.post("/api/auth/setup", async (request) => {
    const parsed = deviceSetupSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AuthError(400, "Enter the email for this account.");
    }
    const { email } = parsed.data;
    if (await isLocked(sql, email)) {
      throw new AuthError(423, "This account is locked after 3 failed sign-ins.");
    }
    const user = await findUser(sql, email);
    if (!user || user.status !== "Active") {
      throw new AuthError(401, "That email is not set up.");
    }
    const code = sixDigitCode();
    const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MS);
    await sql`
      insert into login_code (user_id, code_hash, expires_at)
      values (${user.id}, ${sha256(code)}, ${expiresAt})
    `;
    await writeAudit(sql, "device setup code issued", user.email, user.id);
    console.log(`sign-in code for ${user.email}: ${code}`);
    return {
      needsCode: true,
      name: user.name,
      devCode: process.env.NODE_ENV === "production" ? undefined : code,
    };
  });

  app.post("/api/auth/pin/setup", async (request, reply) => {
    const parsed = pinSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AuthError(400, "Enter a 6-digit PIN.");
    }
    const token = request.cookies[DEVICE_COOKIE];
    const recognised = await findRecognised(sql, token);
    if (!token || !recognised) {
      throw new AuthError(401, "Set up this device first.");
    }
    if (recognised.hasPin) {
      throw new AuthError(409, "This device already has a PIN.");
    }
    const user = await findUser(sql, recognised.email);
    if (!user) {
      throw new AuthError(401, "Set up this device first.");
    }
    const pinHash = await argon2.hash(parsed.data.pin, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    await sql`
      update known_device
      set pin_hash = ${pinHash}
      where token_hash = ${sha256(token)} and revoked_at is null
    `;
    await writeAudit(sql, "device PIN set", user.email, user.id);
    try {
      const session = await readSession(sql, request.cookies[SESSION_COOKIE]);
      if (session.user_id === user.id) {
        return { user: publicUser(user) };
      }
    } catch {
      // No current session. The new PIN opens one.
    }
    const signedIn = await openSession(sql, reply, user, false);
    return { user: signedIn };
  });

  app.post("/api/auth/pin", async (request, reply) => {
    const parsed = pinSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AuthError(400, "Enter a 6-digit PIN.");
    }
    const token = request.cookies[DEVICE_COOKIE];
    const recognised = await findRecognised(sql, token);
    if (!token || !recognised) {
      throw new AuthError(401, "Set up this device first.");
    }
    if (await isLocked(sql, recognised.email)) {
      throw new AuthError(423, "This account is locked after 3 failed sign-ins.");
    }
    const user = await findUser(sql, recognised.email);
    const rows = user
      ? await sql<{ pin_hash: string | null }[]>`
          select pin_hash from known_device
          where token_hash = ${sha256(token)} and revoked_at is null
        `
      : [];
    const pinHash = rows[0]?.pin_hash;
    const pinOk = user && pinHash ? await argon2.verify(pinHash, parsed.data.pin) : false;
    if (!user || !pinOk) {
      await failSignIn(sql, recognised.email, user?.id ?? null, "PIN sign-in failed");
      throw new AuthError(401, "Wrong PIN.");
    }
    const signedIn = await openSession(sql, reply, user, false);
    return { user: signedIn };
  });

  app.get("/api/auth/recognised", async (request) => {
    const recognised = await findRecognised(sql, request.cookies[DEVICE_COOKIE]);
    if (!recognised) {
      return { known: false };
    }
    return { known: true, ...recognised };
  });

  app.post("/api/auth/passkey/enroll/options", async (request) => {
    const token = request.cookies[DEVICE_COOKIE];
    const recognised = await findRecognised(sql, token);
    if (!token || !recognised) {
      throw new AuthError(401, "This device is not set up.");
    }
    if (await isLocked(sql, recognised.email)) {
      throw new AuthError(423, "This account is locked after 3 failed sign-ins.");
    }
    const user = await findUser(sql, recognised.email);
    if (!user || user.status !== "Active") {
      throw new AuthError(401, "This account cannot sign in.");
    }
    const existing = await sql<{ credential_id: string }[]>`
      select credential_id from passkey where user_id = ${user.id} and revoked_at is null
    `;
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: user.email,
      userID: isoBase64URL.toBuffer(isoBase64URL.fromUTF8String(user.id)),
      userDisplayName: user.name,
      attestationType: "none",
      timeout: 60_000,
      excludeCredentials: existing.map((row) => ({ id: row.credential_id })),
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
    });
    await saveChallenge(sql, options.challenge, "register", user.id);
    return options;
  });

  app.post("/api/auth/passkey/enroll/verify", async (request, reply) => {
    const body = request.body as { response?: { clientDataJSON?: string } };
    if (!body.response?.clientDataJSON) {
      throw new AuthError(400, "Passkey response was incomplete.");
    }
    const clientData = JSON.parse(
      Buffer.from(body.response.clientDataJSON, "base64url").toString("utf8"),
    ) as { challenge?: string };
    if (!clientData.challenge) {
      throw new AuthError(400, "Passkey response was incomplete.");
    }
    const challenge = await consumeChallenge(sql, clientData.challenge, "register");
    if (!challenge.user_id) {
      throw new AuthError(400, "That passkey challenge belongs to another account.");
    }
    const verified = await verifyRegistrationResponse({
      response: request.body as never,
      expectedChallenge: clientData.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });
    if (!verified.verified) {
      throw new AuthError(400, "Passkey registration failed.");
    }
    const credential = verified.registrationInfo.credential;
    await sql`
      insert into passkey (user_id, credential_id, public_key, signature_counter)
      values (
        ${challenge.user_id},
        ${credential.id},
        ${isoBase64URL.fromBuffer(credential.publicKey)},
        ${credential.counter}
      )
    `;
    const users = await sql<UserRow[]>`
      select u.id, u.name, u.email, u.password_hash, u.status, r.code as role_code
      from app_user u
      join role r on r.id = u.role_id
      where u.id = ${challenge.user_id}
    `;
    const user = users[0];
    if (!user || user.status !== "Active") {
      throw new AuthError(401, "This account cannot sign in.");
    }
    if (await isLocked(sql, user.email)) {
      throw new AuthError(423, "This account is locked after 3 failed sign-ins.");
    }
    await writeAudit(sql, "passkey registered", null, user.id);
    const signedIn = await openSession(sql, reply, user, true);
    return { user: signedIn };
  });

  app.post("/api/auth/passkey/options", async (request) => {
    const token = request.cookies[DEVICE_COOKIE];
    const recognised = await findRecognised(sql, token);
    if (!token || !recognised?.hasPasskey) {
      return { available: false };
    }
    const keys = await sql<{ credential_id: string }[]>`
      select p.credential_id
      from passkey p
      join known_device d on d.user_id = p.user_id
      where d.token_hash = ${sha256(token)}
        and d.revoked_at is null
        and p.revoked_at is null
    `;
    if (keys.length === 0) {
      return { available: false };
    }
    const body = request.body as { userVerification?: string } | undefined;
    const userVerification = body?.userVerification === "required" ? "required" : "preferred";
    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: keys.map((key) => ({ id: key.credential_id })),
      userVerification,
      timeout: 60_000,
    });
    await saveChallenge(sql, options.challenge, "login", null);
    return options;
  });

  app.post("/api/auth/passkey/verify", async (request, reply) => {
    const body = request.body as { id?: string; response?: { clientDataJSON?: string } };
    if (!body?.id || !body.response?.clientDataJSON) {
      throw new AuthError(400, "Passkey response was incomplete.");
    }
    const clientData = JSON.parse(
      Buffer.from(body.response.clientDataJSON, "base64url").toString("utf8"),
    ) as { challenge?: string };
    if (!clientData.challenge) {
      throw new AuthError(400, "Passkey response was incomplete.");
    }
    await consumeChallenge(sql, clientData.challenge, "login");
    const keys = await sql<{ credential_id: string; public_key: string; signature_counter: number; user_id: string }[]>`
      select credential_id, public_key, signature_counter, user_id
      from passkey
      where credential_id = ${body.id} and revoked_at is null
    `;
    const key = keys[0];
    if (!key) {
      await writeAudit(sql, "passkey sign-in failed", null, null);
      throw new AuthError(401, "This passkey is not registered.");
    }
    let verified;
    try {
      verified = await verifyAuthenticationResponse({
        response: request.body as never,
        expectedChallenge: clientData.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: key.credential_id,
          publicKey: isoBase64URL.toBuffer(key.public_key),
          counter: key.signature_counter,
        },
      });
    } catch (error) {
      await writeAudit(sql, "passkey sign-in failed", null, key.user_id);
      throw new AuthError(401, error instanceof Error ? error.message : "Passkey check failed.");
    }
    if (!verified.verified) {
      await writeAudit(sql, "passkey sign-in failed", null, key.user_id);
      throw new AuthError(401, "Passkey check failed.");
    }
    await sql`
      update passkey
      set signature_counter = ${verified.authenticationInfo.newCounter}
      where credential_id = ${key.credential_id}
    `;
    const users = await sql<UserRow[]>`
      select u.id, u.name, u.email, u.password_hash, u.status, r.code as role_code
      from app_user u
      join role r on r.id = u.role_id
      where u.id = ${key.user_id}
    `;
    const user = users[0];
    if (!user || user.status !== "Active") {
      throw new AuthError(401, "This account cannot sign in.");
    }
    if (await isLocked(sql, user.email)) {
      throw new AuthError(423, "This account is locked after 3 failed sign-ins.");
    }
    if (!(await deviceIsKnown(sql, user.id, request.cookies[DEVICE_COOKIE]))) {
      await rememberDevice(sql, reply, user.id);
    }
    const signedIn = await openSession(sql, reply, user, true);
    return { user: signedIn };
  });

  app.post("/api/auth/passkey/register/options", async (request) => {
    const session = await readSession(sql, request.cookies[SESSION_COOKIE]);
    const users = await sql<{ id: string; email: string; name: string }[]>`
      select id, email, name from app_user where id = ${session.user_id}
    `;
    const user = users[0];
    if (!user) {
      throw new AuthError(401, "Sign in required.");
    }
    const existing = await sql<{ credential_id: string }[]>`
      select credential_id from passkey where user_id = ${user.id} and revoked_at is null
    `;
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: user.email,
      userID: isoBase64URL.toBuffer(isoBase64URL.fromUTF8String(user.id)),
      userDisplayName: user.name,
      attestationType: "none",
      timeout: CHALLENGE_TTL_MS,
      excludeCredentials: existing.map((row) => ({ id: row.credential_id })),
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
    });
    await saveChallenge(sql, options.challenge, "register", user.id);
    return options;
  });

  app.post("/api/auth/passkey/register/verify", async (request) => {
    const session = await readSession(sql, request.cookies[SESSION_COOKIE]);
    const body = request.body as { response?: { clientDataJSON?: string } };
    if (!body.response?.clientDataJSON) {
      throw new AuthError(400, "Passkey response was incomplete.");
    }
    const clientData = JSON.parse(
      Buffer.from(body.response.clientDataJSON, "base64url").toString("utf8"),
    ) as { challenge?: string };
    if (!clientData.challenge) {
      throw new AuthError(400, "Passkey response was incomplete.");
    }
    const challenge = await consumeChallenge(sql, clientData.challenge, "register");
    if (challenge.user_id !== session.user_id) {
      throw new AuthError(400, "That passkey challenge belongs to another account.");
    }
    const verified = await verifyRegistrationResponse({
      response: request.body as never,
      expectedChallenge: clientData.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });
    if (!verified.verified) {
      throw new AuthError(400, "Passkey registration failed.");
    }
    const credential = verified.registrationInfo.credential;
    await sql`
      insert into passkey (user_id, credential_id, public_key, signature_counter)
      values (
        ${session.user_id},
        ${credential.id},
        ${isoBase64URL.fromBuffer(credential.publicKey)},
        ${credential.counter}
      )
    `;
    await sql`update session set step_up_at = now() where id = ${session.id}`;
    await writeAudit(sql, "passkey registered", null, session.user_id);
    return { ok: true };
  });

  app.post("/api/auth/refresh", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    const session = await readSession(sql, token);
    const next = newToken();
    await sql`
      update session
      set previous_token_hash = token_hash, token_hash = ${sha256(next)}, last_seen_at = now()
      where id = ${session.id}
    `;
    reply.setCookie(SESSION_COOKIE, next, cookieOptions());
    return { ok: true };
  });

  app.get("/api/auth/me", async (request) => {
    const session = await readSession(sql, request.cookies[SESSION_COOKIE]);
    const users = await sql<UserRow[]>`
      select u.id, u.name, u.email, u.password_hash, u.status, r.code as role_code
      from app_user u join role r on r.id = u.role_id
      where u.id = ${session.user_id}
    `;
    const user = users[0];
    if (!user) {
      throw new AuthError(401, "Sign in required.");
    }
    return { user: publicUser(user) };
  });

  app.get("/api/auth/step-up", async (request) => {
    const session = await readSession(sql, request.cookies[SESSION_COOKIE]);
    if (!session.step_up_at || Date.now() - session.step_up_at.getTime() > STEP_UP_TTL_MS) {
      throw new AuthError(403, "Confirm with this device. The last check was more than 5 minutes ago.");
    }
    return { ok: true };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      await sql`
        update session set revoked_at = now()
        where token_hash = ${sha256(token)} and revoked_at is null
      `;
    }
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.addHook("onClose", async () => {
    await sql.end();
  });

  return { app, sql };
}

export async function migrateDatabase(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const db = drizzle(sql);
    const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
    await migrate(db, { migrationsFolder: folder });
  } finally {
    await sql.end();
  }
}

export function readSessionCookie(request: FastifyRequest): string | undefined {
  return request.cookies[SESSION_COOKIE];
}
