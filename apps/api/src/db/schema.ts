import { sql } from "drizzle-orm";
import {
  check,
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Phase 0 tables.
 * SQL names are snake_case. Primary keys are uuid. Times are timestamptz.
 * Those three choices were not in the brief; they are the technical defaults
 * used so step 0.2 can be built. See the step 0.2 report.
 */

export const role = pgTable("role", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
});

export const appUser = pgTable("app_user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  roleId: uuid("role_id")
    .notNull()
    .references(() => role.id),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const permissionGrant = pgTable(
  "permission_grant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id),
    permissionKey: text("permission_key").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    reason: text("reason"),
    grantedBy: uuid("granted_by").references(() => appUser.id),
    accessCodeHash: text("access_code_hash"),
    accessCodeExpiresAt: timestamp("access_code_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "permission_grant_code_has_expiry",
      sql`${table.accessCodeHash} is null or ${table.accessCodeExpiresAt} is not null`,
    ),
  ],
);

export const session = pgTable("session", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => appUser.id),
  tokenHash: text("token_hash").notNull().unique(),
  previousTokenHash: text("previous_token_hash"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  stepUpAt: timestamp("step_up_at", { withTimezone: true, mode: "date" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const passkey = pgTable("passkey", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => appUser.id),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  signatureCounter: integer("signature_counter").notNull().default(0),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const loginAttempt = pgTable("login_attempt", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => appUser.id),
  email: text("email").notNull(),
  succeeded: boolean("succeeded").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  whatHappened: text("what_happened").notNull(),
  toWhom: text("to_whom"),
  whoAskedUserId: uuid("who_asked_user_id").references(() => appUser.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const partner = pgTable("partner", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealer: text("dealer").notNull(),
  phone: text("phone"),
  place: text("place"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const device = pgTable(
  "device",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    imei: text("imei").notNull(),
    serial: text("serial"),
    model: text("model"),
    colour: text("colour"),
    storage: text("storage"),
    condition: text("condition"),
    battery: text("battery"),
    status: text("status"),
    currentLocation: text("current_location"),
    origin: text("origin").notNull(),
    partnerId: uuid("partner_id").references(() => partner.id),
    direction: text("direction"),
    due: text("due"),
    settlement: text("settlement"),
    swap: text("swap"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "device_origin_known",
      sql`${table.origin} in ('new', 'ex_uk', 'trade_in', 'borrowed')`,
    ),
    check(
      "device_ex_uk_code_is_imei",
      sql`${table.origin} <> 'ex_uk' or ${table.code} = ${table.imei}`,
    ),
    check(
      "device_generated_code_is_13_digits",
      sql`${table.origin} not in ('trade_in', 'borrowed') or ${table.code} ~ '^[0-9]{13}$'`,
    ),
  ],
);

export const deviceEvent = pgTable("device_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: uuid("device_id")
    .notNull()
    .references(() => device.id),
  whatHappened: text("what_happened").notNull(),
  whoUserId: uuid("who_user_id").references(() => appUser.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const deviceCostEntry = pgTable(
  "device_cost_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => device.id),
    kind: text("kind").notNull(),
    amountKes: integer("amount_kes").notNull(),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => appUser.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "device_cost_entry_kind_known",
      sql`${table.kind} in ('purchase', 'freight', 'repair', 'parts', 'trade_in_value')`,
    ),
  ],
);

export const paymentRecord = pgTable("payment_record", {
  id: uuid("id").primaryKey().defaultRandom(),
  method: text("method").notNull(),
  codeOrReference: text("code_or_reference"),
  amountKes: integer("amount_kes").notNull(),
  recordedBy: uuid("recorded_by")
    .notNull()
    .references(() => appUser.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const setting = pgTable(
  "setting",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id),
    section: text("section").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("setting_user_section_key").on(table.userId, table.section, table.key),
  ],
);
