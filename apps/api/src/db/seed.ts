import argon2 from "argon2";
import postgres from "postgres";

const hashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

const devUsers = [
  {
    role: "OWNER",
    name: "Dev owner",
    email: "owner.dev@fitech.test",
    password: "Dev-owner-0.2",
  },
  {
    role: "MANAGER",
    name: "Dev manager",
    email: "manager.dev@fitech.test",
    password: "Dev-manager-0.2",
  },
  {
    role: "CASHIER",
    name: "Dev cashier",
    email: "cashier.dev@fitech.test",
    password: "Dev-cashier-0.2",
  },
  {
    role: "INVENTORY",
    name: "Dev inventory",
    email: "inventory.dev@fitech.test",
    password: "Dev-inventory-0.2",
  },
] as const;

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
  for (const user of devUsers) {
    const existing = await sql<{ id: string }[]>`
      select id from app_user where email = ${user.email}
    `;
    if (existing.length > 0) {
      console.log(`exists ${user.role} ${user.email}`);
      continue;
    }

    const roles = await sql<{ id: string }[]>`
      select id from role where code = ${user.role}
    `;
    const role = roles[0];
    if (!role) {
      throw new Error(`role ${user.role} is missing. Run migrations first.`);
    }

    const passwordHash = await argon2.hash(user.password, hashOptions);
    await sql`
      insert into app_user (name, email, password_hash, role_id, status)
      values (${user.name}, ${user.email}, ${passwordHash}, ${role.id}, 'Active')
    `;
    console.log(`inserted ${user.role} ${user.email}`);
  }

  console.log(
    `argon2id memoryCost=${hashOptions.memoryCost} timeCost=${hashOptions.timeCost} parallelism=${hashOptions.parallelism}`,
  );
} finally {
  await sql.end();
}
