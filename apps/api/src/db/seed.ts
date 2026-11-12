import argon2 from "argon2";
import postgres from "postgres";
import { defaultPermissionKeys, PERMISSIONS_SET, type DynamicPermissionKey } from "shared";

const hashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

const devUsers: readonly {
  role: "OWNER" | "MANAGER" | "CASHIER" | "INVENTORY";
  name: string;
  email: string;
  password: string;
  grants: readonly DynamicPermissionKey[] | null;
}[] = [
  {
    role: "OWNER",
    name: "Dev owner",
    email: "owner.dev@fitech.test",
    password: "Dev-owner-0.2",
    grants: null,
  },
  {
    role: "MANAGER",
    name: "Dev manager",
    email: "manager.dev@fitech.test",
    password: "Dev-manager-0.2",
    grants: defaultPermissionKeys("MANAGER"),
  },
  {
    role: "CASHIER",
    name: "Dev cashier",
    email: "cashier.dev@fitech.test",
    password: "Dev-cashier-0.2",
    grants: defaultPermissionKeys("CASHIER"),
  },
  {
    role: "INVENTORY",
    name: "Dev inventory",
    email: "inventory.dev@fitech.test",
    password: "Dev-inventory-0.2",
    grants: defaultPermissionKeys("INVENTORY"),
  },
  {
    role: "CASHIER",
    name: "Test sales only",
    email: "sales.only.dev@fitech.test",
    password: "Dev-sales-0.2",
    grants: ["sales.record"],
  },
  {
    role: "CASHIER",
    name: "Test cost cashier",
    email: "cost.dev@fitech.test",
    password: "Dev-cost-0.2",
    grants: ["sales.record", "deliveries.hand", "lipa.collect", "costs.add"],
  },
  {
    role: "INVENTORY",
    name: "Test stock and sell",
    email: "stock.sell.dev@fitech.test",
    password: "Dev-sell-0.2",
    grants: ["stock.receive", "sales.record"],
  },
];

if (process.env.NODE_ENV === "production") {
  console.error("seed refused: NODE_ENV is production");
  process.exit(1);
}

if (!process.argv.includes("--dev")) {
  console.error("seed refused: pass --dev. This seed is for development only.");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL ?? "postgres://127.0.0.1:5433/fitech";
if (databaseUrl.includes("fitech_test")) {
  console.error("seed refused: this command does not seed the test database");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

try {
  const ownerRows = await sql<{ id: string }[]>`
    select id from app_user where email = 'owner.dev@fitech.test'
  `;
  let grantedBy = ownerRows[0]?.id ?? null;

  for (const user of devUsers) {
    const roles = await sql<{ id: string }[]>`
      select id from role where code = ${user.role}
    `;
    const role = roles[0];
    if (!role) {
      throw new Error(`role ${user.role} is missing. Run migrations first.`);
    }

    const existing = await sql<{ id: string }[]>`
      select id from app_user where email = ${user.email}
    `;
    let userId = existing[0]?.id;
    if (!userId) {
      const passwordHash = await argon2.hash(user.password, hashOptions);
      const inserted = await sql<{ id: string }[]>`
        insert into app_user (name, email, password_hash, role_id, status)
        values (${user.name}, ${user.email}, ${passwordHash}, ${role.id}, 'Active')
        returning id
      `;
      userId = inserted[0]?.id;
      console.log(`inserted ${user.role} ${user.email}`);
    } else {
      console.log(`exists ${user.role} ${user.email}`);
    }
    if (!userId) {
      throw new Error(`user ${user.email} was not saved`);
    }
    if (user.role === "OWNER") {
      grantedBy = userId;
    }
    if (!user.grants || !grantedBy) {
      continue;
    }
    const chosen = await sql<{ id: string }[]>`
      select id from permission_grant
      where user_id = ${userId}
        and permission_key = ${PERMISSIONS_SET}
        and (expires_at is null or expires_at > now())
      limit 1
    `;
    if (chosen[0]) {
      console.log(`permissions already chosen ${user.email}`);
      continue;
    }
    await sql`
      insert into permission_grant (user_id, permission_key, granted_by)
      values (${userId}, ${PERMISSIONS_SET}, ${grantedBy})
    `;
    for (const key of user.grants) {
      await sql`
        insert into permission_grant (user_id, permission_key, granted_by)
        values (${userId}, ${key}, ${grantedBy})
      `;
    }
    console.log(`permissions ${user.email}: ${user.grants.join(", ")}`);
  }

  const dealers = await sql<{ id: string }[]>`
    select id from partner where dealer = 'Test dealer'
  `;
  let partnerId = dealers[0]?.id;
  if (!partnerId) {
    const inserted = await sql<{ id: string }[]>`
      insert into partner (dealer, phone, place)
      values ('Test dealer', '0700111222', 'Test place')
      returning id
    `;
    partnerId = inserted[0]?.id;
    console.log("inserted partner Test dealer");
  }
  if (!partnerId) {
    throw new Error("partner was not saved");
  }

  const phones = [
    {
      code: "TST-BLACK-128",
      imei: "359111111111111",
      model: "Test iPhone 13",
      colour: "Black",
      storage: "128GB",
      status: "in stock",
      origin: "new",
      partner: null as string | null,
    },
    {
      code: "TST-BLUE-256",
      imei: "359111111111112",
      model: "Test iPhone 13",
      colour: "Blue",
      storage: "256GB",
      status: "in stock",
      origin: "new",
      partner: null,
    },
    {
      code: "1000000000001",
      imei: "359111111111113",
      model: "Test iPhone 13",
      colour: "Gold",
      storage: "256GB",
      status: "in stock",
      origin: "borrowed",
      partner: partnerId,
    },
    {
      code: "TST-SOLD-RED",
      imei: "359111111111114",
      model: "Test iPhone 13",
      colour: "Red",
      storage: "128GB",
      status: "sold",
      origin: "new",
      partner: null,
    },
  ];
  for (const phone of phones) {
    const found = await sql<{ id: string }[]>`select id from device where code = ${phone.code}`;
    if (found[0]) {
      continue;
    }
    await sql`
      insert into device (code, imei, model, colour, storage, status, origin, partner_id, direction)
      values (
        ${phone.code}, ${phone.imei}, ${phone.model}, ${phone.colour}, ${phone.storage},
        ${phone.status}, ${phone.origin}, ${phone.partner}, ${phone.partner ? "in" : null}
      )
    `;
    console.log(`inserted phone ${phone.code} ${phone.status}`);
  }

  console.log(
    `argon2id memoryCost=${hashOptions.memoryCost} timeCost=${hashOptions.timeCost} parallelism=${hashOptions.parallelism}`,
  );
} finally {
  await sql.end();
}
