import { randomInt, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { PostgresError } from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const sql = postgres(databaseUrl, { max: 1 });

type Ids = {
  userId: string;
  eventId: string;
  costId: string;
  paymentId: string;
  auditId: string;
};

const ids: Ids = {
  userId: "",
  eventId: "",
  costId: "",
  paymentId: "",
  auditId: "",
};

function thirteenDigitCode(): string {
  return String(randomInt(0, 10 ** 13)).padStart(13, "0");
}

async function expectRejected(run: () => Promise<unknown>, table: string, operation: string) {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(PostgresError);
    const pgError = error as PostgresError;
    expect(pgError.code).toBe("P0001");
    expect(pgError.message).toContain(`append-only table ${table} rejects ${operation}`);
    return;
  }
  throw new Error(`${table} ${operation} was not rejected`);
}

beforeAll(async () => {
  const db = drizzle(sql);
  const migrationsFolder = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../migrations",
  );
  await migrate(db, { migrationsFolder });

  const roles = await sql<{ id: string }[]>`
    select id from role where code = 'CASHIER'
  `;
  const role = roles[0];
  if (!role) {
    throw new Error("CASHIER role is missing after migrate");
  }

  const email = `append.${randomUUID()}@fitech.test`;
  const users = await sql<{ id: string }[]>`
    insert into app_user (name, email, password_hash, role_id, status)
    values ('Append test', ${email}, 'not-a-login-hash', ${role.id}, 'Active')
    returning id
  `;
  const user = users[0];
  if (!user) {
    throw new Error("test user insert failed");
  }
  ids.userId = user.id;

  const devices = await sql<{ id: string }[]>`
    insert into device (code, imei, origin)
    values (${thirteenDigitCode()}, '490154203237518', 'trade_in')
    returning id
  `;
  const device = devices[0];
  if (!device) {
    throw new Error("test device insert failed");
  }

  const events = await sql<{ id: string }[]>`
    insert into device_event (device_id, what_happened, who_user_id)
    values (${device.id}, 'received', ${user.id})
    returning id
  `;
  const costs = await sql<{ id: string }[]>`
    insert into device_cost_entry (device_id, kind, amount_kes, recorded_by)
    values (${device.id}, 'purchase', 100, ${user.id})
    returning id
  `;
  const payments = await sql<{ id: string }[]>`
    insert into payment_record (method, amount_kes, recorded_by)
    values ('cash', 100, ${user.id})
    returning id
  `;
  const audits = await sql<{ id: string }[]>`
    insert into audit_log (what_happened, to_whom, who_asked_user_id)
    values ('sign-in', ${email}, ${user.id})
    returning id
  `;

  const event = events[0];
  const cost = costs[0];
  const payment = payments[0];
  const audit = audits[0];
  if (!event || !cost || !payment || !audit) {
    throw new Error("append-only insert failed");
  }
  ids.eventId = event.id;
  ids.costId = cost.id;
  ids.paymentId = payment.id;
  ids.auditId = audit.id;
});

afterAll(async () => {
  await sql.end();
});

describe("append-only tables", () => {
  it("rejects UPDATE and DELETE on device_event", async () => {
    await expectRejected(
      () => sql`update device_event set what_happened = 'sold' where id = ${ids.eventId}`,
      "device_event",
      "UPDATE",
    );
    await expectRejected(
      () => sql`delete from device_event where id = ${ids.eventId}`,
      "device_event",
      "DELETE",
    );
    const rows = await sql<{ what_happened: string }[]>`
      select what_happened from device_event where id = ${ids.eventId}
    `;
    expect(rows[0]?.what_happened).toBe("received");
  });

  it("rejects UPDATE and DELETE on device_cost_entry", async () => {
    await expectRejected(
      () => sql`update device_cost_entry set amount_kes = 1 where id = ${ids.costId}`,
      "device_cost_entry",
      "UPDATE",
    );
    await expectRejected(
      () => sql`delete from device_cost_entry where id = ${ids.costId}`,
      "device_cost_entry",
      "DELETE",
    );
    const rows = await sql<{ amount_kes: number }[]>`
      select amount_kes from device_cost_entry where id = ${ids.costId}
    `;
    expect(rows[0]?.amount_kes).toBe(100);
  });

  it("rejects UPDATE and DELETE on payment_record", async () => {
    await expectRejected(
      () => sql`update payment_record set method = 'bank' where id = ${ids.paymentId}`,
      "payment_record",
      "UPDATE",
    );
    await expectRejected(
      () => sql`delete from payment_record where id = ${ids.paymentId}`,
      "payment_record",
      "DELETE",
    );
    const rows = await sql<{ method: string }[]>`
      select method from payment_record where id = ${ids.paymentId}
    `;
    expect(rows[0]?.method).toBe("cash");
  });

  it("rejects UPDATE and DELETE on audit_log", async () => {
    await expectRejected(
      () => sql`update audit_log set what_happened = 'edited' where id = ${ids.auditId}`,
      "audit_log",
      "UPDATE",
    );
    await expectRejected(
      () => sql`delete from audit_log where id = ${ids.auditId}`,
      "audit_log",
      "DELETE",
    );
    const rows = await sql<{ what_happened: string }[]>`
      select what_happened from audit_log where id = ${ids.auditId}
    `;
    expect(rows[0]?.what_happened).toBe("sign-in");
  });

  it("still allows UPDATE on app_user", async () => {
    await sql`update app_user set name = 'Append test renamed' where id = ${ids.userId}`;
    const rows = await sql<{ name: string }[]>`
      select name from app_user where id = ${ids.userId}
    `;
    expect(rows[0]?.name).toBe("Append test renamed");
  });
});
