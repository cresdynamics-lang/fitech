import argon2 from "argon2";
import type postgres from "postgres";
import { defaultPermissionKeys, isDynamicPermissionKey, PERMISSIONS_SET } from "shared";
import { shopFail, type ShopFail, type ShopOk } from "./stock.js";

type Sql = ReturnType<typeof postgres>;

const CREATABLE_ROLES = ["MANAGER", "CASHIER", "INVENTORY"] as const;

export type StaffDevice = {
  id: string;
  createdAt: string;
  hasPin: boolean;
};

export type StaffSession = {
  id: string;
  lastSeenAt: string;
  createdAt: string;
};

export type StaffPerson = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastSeen: string | null;
  signIn: string;
  grants: string[];
  devices: StaffDevice[];
  sessions: StaffSession[];
};

export async function listStaff(sql: Sql): Promise<StaffPerson[]> {
  const people = await sql<
    { id: string; name: string; email: string; role: string; status: string; last_seen: Date | null }[]
  >`
    select u.id, u.name, u.email, u.status, r.code as role,
      (
        select max(s.last_seen_at)
        from session s
        where s.user_id = u.id and s.revoked_at is null
      ) as last_seen
    from app_user u
    join role r on r.id = u.role_id
    order by u.name
  `;
  const devices = await sql<{ id: string; user_id: string; has_pin: boolean; created_at: Date }[]>`
    select id, user_id, pin_hash is not null as has_pin, created_at
    from known_device
    where revoked_at is null
    order by created_at desc
  `;
  const sessions = await sql<{ id: string; user_id: string; last_seen_at: Date; created_at: Date }[]>`
    select id, user_id, last_seen_at, created_at
    from session
    where revoked_at is null
    order by last_seen_at desc
  `;
  const grants = await sql<{ user_id: string; permission_key: string }[]>`
    select user_id, permission_key
    from permission_grant
    where expires_at is null or expires_at > now()
  `;
  const passkeys = await sql<{ user_id: string }[]>`
    select distinct user_id from passkey where revoked_at is null
  `;
  const passkeyIds = new Set(passkeys.map((row) => row.user_id));
  return people.map((person) => {
    const ownDevices = devices.filter((device) => device.user_id === person.id);
    const hasPin = ownDevices.some((device) => device.has_pin);
    let signIn = "Password and code";
    if (hasPin) {
      signIn = "PIN on";
    } else if (passkeyIds.has(person.id)) {
      signIn = "Device unlock on";
    }
    return {
      id: person.id,
      name: person.name,
      email: person.email,
      role: person.role,
      status: person.status,
      lastSeen: person.last_seen ? person.last_seen.toISOString() : null,
      signIn,
      grants: grants.filter((grant) => grant.user_id === person.id).map((grant) => grant.permission_key),
      devices: ownDevices.map((device) => ({
        id: device.id,
        createdAt: device.created_at.toISOString(),
        hasPin: device.has_pin,
      })),
      sessions: sessions
        .filter((session) => session.user_id === person.id)
        .map((session) => ({
          id: session.id,
          lastSeenAt: session.last_seen_at.toISOString(),
          createdAt: session.created_at.toISOString(),
        })),
    };
  });
}

export async function createStaff(
  sql: Sql,
  input: { name: string; email: string; password: string; role: string; grants: string[] | null; grantedBy: string },
): Promise<ShopOk<{ id: string; email: string }> | ShopFail> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const role = input.role;
  if (!name) {
    return shopFail(400, "Enter the person's name.");
  }
  if (!email.includes("@")) {
    return shopFail(400, "Enter a valid email.");
  }
  if (!password) {
    return shopFail(400, "Enter a password.");
  }
  if (!CREATABLE_ROLES.includes(role as (typeof CREATABLE_ROLES)[number])) {
    return shopFail(400, "Choose branch manager, cashier or inventory lead.");
  }
  const roles = await sql<{ id: string }[]>`select id from role where code = ${role}`;
  const roleRow = roles[0];
  if (!roleRow) {
    return shopFail(400, "Choose branch manager, cashier or inventory lead.");
  }
  const existing = await sql<{ id: string }[]>`select id from app_user where lower(email) = ${email}`;
  if (existing[0]) {
    return shopFail(409, "That email is already an account.");
  }
  const chosen = [...new Set((input.grants ?? defaultPermissionKeys(role)).map((key) => key.trim()))];
  if (chosen.some((key) => !isDynamicPermissionKey(key))) {
    return shopFail(400, "That permission is not one a staff member can be given. Finance stays with the owner.");
  }
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const created = await sql.begin(async (tx) => {
    const rows = await tx<{ id: string }[]>`
      insert into app_user (name, email, password_hash, role_id, status)
      values (${name}, ${email}, ${passwordHash}, ${roleRow.id}, 'Active')
      returning id
    `;
    const id = rows[0]?.id;
    if (!id) {
      return null;
    }
    await tx`
      insert into permission_grant (user_id, permission_key, granted_by)
      values (${id}, ${PERMISSIONS_SET}, ${input.grantedBy})
    `;
    for (const key of chosen) {
      await tx`
        insert into permission_grant (user_id, permission_key, granted_by)
        values (${id}, ${key}, ${input.grantedBy})
      `;
    }
    return id;
  });
  if (!created) {
    return shopFail(500, "The account was not saved.");
  }
  return { ok: true, value: { id: created, email } };
}

async function rememberChoice(
  sql: Sql,
  person: { id: string; role: string },
  grantedBy: string,
): Promise<void> {
  const marker = await sql<{ id: string }[]>`
    select id from permission_grant
    where user_id = ${person.id}
      and permission_key = ${PERMISSIONS_SET}
      and (expires_at is null or expires_at > now())
    limit 1
  `;
  if (marker[0]) {
    return;
  }
  await sql`
    insert into permission_grant (user_id, permission_key, granted_by)
    values (${person.id}, ${PERMISSIONS_SET}, ${grantedBy})
  `;
  for (const key of defaultPermissionKeys(person.role)) {
    await sql`
      insert into permission_grant (user_id, permission_key, granted_by)
      values (${person.id}, ${key}, ${grantedBy})
    `;
  }
}

export async function setGrant(
  sql: Sql,
  input: { userId: string; key: string; enabled: boolean; grantedBy: string },
): Promise<ShopOk<{ email: string }> | ShopFail> {
  if (!isDynamicPermissionKey(input.key)) {
    return shopFail(400, "That permission is not one a staff member can be given. Finance stays with the owner.");
  }
  const people = await sql<{ id: string; email: string; role: string }[]>`
    select u.id, u.email, r.code as role
    from app_user u
    join role r on r.id = u.role_id
    where u.id = ${input.userId}
  `;
  const person = people[0];
  if (!person) {
    return shopFail(404, "That person is not on the staff list.");
  }
  await rememberChoice(sql, person, input.grantedBy);
  if (input.enabled) {
    await sql`
      insert into permission_grant (user_id, permission_key, granted_by)
      select ${person.id}, ${input.key}, ${input.grantedBy}
      where not exists (
        select 1 from permission_grant
        where user_id = ${person.id}
          and permission_key = ${input.key}
          and (expires_at is null or expires_at > now())
      )
    `;
  } else {
    await sql`
      update permission_grant
      set expires_at = now()
      where user_id = ${person.id}
        and permission_key = ${input.key}
        and (expires_at is null or expires_at > now())
    `;
  }
  return { ok: true, value: { email: person.email } };
}

export async function revokeDevice(
  sql: Sql,
  userId: string,
  deviceId: string,
): Promise<ShopOk<{ email: string }> | ShopFail> {
  const people = await sql<{ email: string }[]>`select email from app_user where id = ${userId}`;
  const person = people[0];
  if (!person) {
    return shopFail(404, "That person is not on the staff list.");
  }
  const updated = await sql<{ id: string }[]>`
    update known_device
    set revoked_at = now()
    where id = ${deviceId} and user_id = ${userId} and revoked_at is null
    returning id
  `;
  if (!updated[0]) {
    return shopFail(404, "That device is not signed in for this person.");
  }
  await sql`
    update session
    set revoked_at = now()
    where user_id = ${userId} and revoked_at is null
  `;
  return { ok: true, value: { email: person.email } };
}

export async function revokeAllDevices(
  sql: Sql,
  userId: string,
): Promise<ShopOk<{ email: string }> | ShopFail> {
  const people = await sql<{ email: string }[]>`select email from app_user where id = ${userId}`;
  const person = people[0];
  if (!person) {
    return shopFail(404, "That person is not on the staff list.");
  }
  await sql`
    update known_device
    set revoked_at = now()
    where user_id = ${userId} and revoked_at is null
  `;
  await sql`
    update session
    set revoked_at = now()
    where user_id = ${userId} and revoked_at is null
  `;
  return { ok: true, value: { email: person.email } };
}
