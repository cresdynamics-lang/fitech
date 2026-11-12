import { buildApp, migrateDatabase } from "./app.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://127.0.0.1:5433/fitech";
const port = Number(process.env.PORT ?? 3001);

await migrateDatabase(databaseUrl);
const { app } = await buildApp(databaseUrl);
await app.listen({ port, host: "127.0.0.1" });
console.log(`api listening on http://127.0.0.1:${port}`);
