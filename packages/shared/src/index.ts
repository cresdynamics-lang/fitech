import { z } from "zod";

/** Shop identity used on receipts, invoices, and messages. */
export const FITECH_SHOP = {
  name: "Fitech",
  place: "Nairobi, Kenya",
  email: "info@fitech.co.ke",
  phone: "0708451517",
  website: "https://fitech.co.ke",
  websiteLabel: "fitech.co.ke",
} as const;

/** Login locks after this many failed attempts. The lock duration is not set. */
export const LOGIN_FAILURES_BEFORE_LOCK = 3;

/** The 6-digit new-device code is valid for 5 minutes. */
export const EMAIL_CODE_TTL_MS = 5 * 60 * 1000;

/** A sensitive action needs a passkey check within this window. */
export const STEP_UP_TTL_MS = 5 * 60 * 1000;

/** WebAuthn challenges are single use and expire on this same window. */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export const passwordSignInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  requireCode: z.boolean().optional(),
});

export const codeSignInSchema = z.object({
  email: z.email(),
  code: z.string().regex(/^\d{6}$/),
});

export const pinSchema = z.object({
  pin: z.string().regex(/^\d{6}$/),
});

export const deviceSetupSchema = z.object({
  email: z.email(),
});

/** Only OWNER may see these. The words are the ones in the brief. */
export const OWNER_ONLY_FINANCE = [
  "cost",
  "buying price",
  "profit",
  "margin",
  "expenses",
  "payroll",
  "stock value",
  "Lipa totals",
] as const;

/** A temporary cost read is at least 5 minutes and at most 8 hours. */
export const READ_UNLOCK_MIN_MS = 5 * 60 * 1000;
export const READ_UNLOCK_MAX_MS = 8 * 60 * 60 * 1000;

/** Standing grants. Both are write-only. Neither reveals a finance figure. */
export const STANDING_WRITE_KEYS = ["costs.add", "repairs.manage"] as const;

const COST_ENTRY_KINDS = new Set(["purchase", "freight", "repair", "parts", "trade_in_value"]);

export function canSeeFinance(role: string): boolean {
  return role === "OWNER";
}

export function canRecordOwnerLedger(role: string): boolean {
  return role === "OWNER";
}

export function readUnlockDurationAllowed(durationMs: number): boolean {
  return durationMs >= READ_UNLOCK_MIN_MS && durationMs <= READ_UNLOCK_MAX_MS;
}

export function isStandingWriteKey(key: string): boolean {
  return (STANDING_WRITE_KEYS as readonly string[]).includes(key);
}

/** Written once when the owner chooses this person's permissions. */
export const PERMISSIONS_SET = "permissions.set";

/**
 * Chosen per person when the account is created. Finance is not in this list.
 * `roles` is the starting set for that job. The owner can change each one.
 */
export const DYNAMIC_PERMISSIONS = [
  { key: "sales.record", label: "Record a sale and its payment path", roles: ["MANAGER", "CASHIER"] },
  { key: "sales.price", label: "Change price or warranty at the till", roles: ["MANAGER"] },
  { key: "repairs.manage", label: "Update repair jobs and reminders", roles: ["MANAGER"] },
  { key: "deliveries.hand", label: "Hand phones to riders, close deliveries", roles: ["MANAGER", "CASHIER"] },
  { key: "partners.borrow", label: "Give or borrow phones with dealers", roles: ["MANAGER"] },
  { key: "stock.receive", label: "Receive stock and scan arrivals", roles: ["MANAGER", "INVENTORY"] },
  { key: "costs.add", label: "Enter a cost line on a device", roles: [] },
  { key: "lipa.collect", label: "Collect Lipa", roles: ["MANAGER", "CASHIER"] },
] as const;

export type DynamicPermissionKey = (typeof DYNAMIC_PERMISSIONS)[number]["key"];

export function isDynamicPermissionKey(key: string): key is DynamicPermissionKey {
  return DYNAMIC_PERMISSIONS.some((item) => item.key === key);
}

export function defaultPermissionKeys(role: string): DynamicPermissionKey[] {
  return DYNAMIC_PERMISSIONS.filter((item) => (item.roles as readonly string[]).includes(role)).map((item) => item.key);
}

export type RoleAccess = {
  label: string;
  access: "on" | "off" | "locked" | "availability" | "collect";
  grantKey: string | null;
  offNote: string;
};

const FIXED_ROWS: readonly {
  label: string;
  on: readonly string[];
  finance?: boolean;
  cashierAvailability?: boolean;
}[] = [
  { label: "See selling price of items", on: ["OWNER", "MANAGER", "CASHIER", "INVENTORY"] },
  { label: "Trade-in: decide broken or ready", on: ["OWNER", "MANAGER", "CASHIER", "INVENTORY"] },
  { label: "See stock levels and restock list", on: ["OWNER", "MANAGER", "INVENTORY"], cashierAvailability: true },
  { label: "See buying price, landed cost, partner price", on: ["OWNER"], finance: true },
  { label: "See profit, margin, P&L, day and month totals", on: ["OWNER"], finance: true },
  { label: "Record expenses, marketing, salaries", on: ["OWNER"], finance: true },
  { label: "See Lipa totals and overdue amounts", on: ["OWNER"], finance: true },
  { label: "Manage staff, permissions and devices", on: ["OWNER"] },
];

function dynamicIsOn(role: string, grants: readonly string[], key: string, defaults: readonly string[]): boolean {
  if (role === "OWNER") {
    return true;
  }
  if (grants.includes(PERMISSIONS_SET)) {
    return grants.includes(key);
  }
  return defaults.includes(role);
}

/** What this person can do. Dynamic rows are chosen per person. Finance stays with the owner. */
export function roleAccess(role: string, grants: readonly string[]): RoleAccess[] {
  const dynamic = DYNAMIC_PERMISSIONS.map((item) => {
    const on = dynamicIsOn(role, grants, item.key, item.roles);
    if (item.key === "lipa.collect" && role === "CASHIER" && on) {
      return { label: item.label, access: "collect" as const, grantKey: item.key, offNote: "" };
    }
    return {
      label: item.label,
      access: on ? ("on" as const) : ("off" as const),
      grantKey: role === "OWNER" ? null : item.key,
      offNote: !on && item.key === "repairs.manage" && role === "CASHIER" ? "Own jobs" : "",
    };
  });
  const fixed = FIXED_ROWS.map((row) => {
    if (row.finance) {
      return {
        label: row.label,
        access: role === "OWNER" ? ("on" as const) : ("locked" as const),
        grantKey: null,
        offNote: "",
      };
    }
    if (row.cashierAvailability && role === "CASHIER") {
      return { label: row.label, access: "availability" as const, grantKey: null, offNote: "" };
    }
    return {
      label: row.label,
      access: row.on.includes(role) ? ("on" as const) : ("off" as const),
      grantKey: null,
      offNote: "",
    };
  });
  return [...dynamic, ...fixed];
}

export function filterFinance<T>(role: string, value: T): T {
  if (canSeeFinance(role)) {
    return value;
  }
  return stripFinance(value) as T;
}

function stripFinance(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripFinance);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const source = value as Record<string, unknown>;
  const hideCostAmount = typeof source.kind === "string" && COST_ENTRY_KINDS.has(source.kind);
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) {
    if ((OWNER_ONLY_FINANCE as readonly string[]).includes(key)) {
      continue;
    }
    if (hideCostAmount && (key === "amountKes" || key === "amount_kes")) {
      continue;
    }
    next[key] = stripFinance(child);
  }
  return next;
}

export type PasswordSignIn = z.infer<typeof passwordSignInSchema>;
export type CodeSignIn = z.infer<typeof codeSignInSchema>;

/** One-page PDF of plain lines. Used for the receipt and the invoice. */
export function buildShopPdf(lines: string[]): Uint8Array {
  const printable = lines.flatMap((line) => wrapPdfLine(pdfSafe(line), 90));
  const commands = printable
    .map((line, index) => `BT /F1 11 Tf 48 ${800 - index * 16} Td (${line}) Tj ET`)
    .join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
    `4 0 obj << /Length ${commands.length} >> stream\n${commands}\nendstream endobj\n`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }
  const xref = body.length;
  let trailer = `xref\n0 ${objects.length + 1}\n`;
  trailer += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    trailer += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  trailer += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const pdf = body + trailer;
  const bytes = new Uint8Array(pdf.length);
  for (let index = 0; index < pdf.length; index += 1) {
    bytes[index] = pdf.charCodeAt(index);
  }
  return bytes;
}

function pdfSafe(value: string): string {
  return value
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapPdfLine(value: string, width: number): string[] {
  if (value.length <= width) {
    return [value];
  }
  const lines: string[] = [];
  for (let index = 0; index < value.length; index += width) {
    lines.push(value.slice(index, index + width));
  }
  return lines;
}
