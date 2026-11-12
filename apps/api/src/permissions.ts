import type { Sql } from "postgres";
import { isStandingWriteKey } from "shared";

export async function hasStandingWrite(sql: Sql, userId: string, key: string): Promise<boolean> {
  if (!isStandingWriteKey(key)) {
    return false;
  }
  const rows = await sql<{ id: string }[]>`
    select id
    from permission_grant
    where user_id = ${userId}
      and permission_key = ${key}
      and (expires_at is null or expires_at > now())
    limit 1
  `;
  return rows.length > 0;
}
