import { randomInt } from "node:crypto";
import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

export type StockUnit = {
  id: string;
  code: string;
  model: string;
  colour: string;
  storage: string;
  condition: string;
  source: string;
};

export type ShopFail = { ok: false; status: number; error: string };
export type ShopOk<T> = { ok: true; value: T };

export function shopFail(status: number, error: string): ShopFail {
  return { ok: false, status, error };
}

/** Phones that can be sold: in stock, including a row whose status was never set. */
export async function listStock(sql: Sql, name: string): Promise<StockUnit[]> {
  const term = name.trim();
  const rows = await sql<StockUnit[]>`
    select d.id, d.code,
      coalesce(d.model, '') as model,
      coalesce(d.colour, '') as colour,
      coalesce(d.storage, '') as storage,
      coalesce(d.condition, '') as condition,
      coalesce(p.dealer, '') as source
    from device d
    left join partner p on p.id = d.partner_id
    where (
      d.status is null
      or btrim(d.status) = ''
      or lower(btrim(d.status)) = 'in stock'
    )
      and (${term} = '' or d.model ilike ${"%" + term + "%"})
    order by d.model nulls last, d.colour, d.storage, d.code
  `;
  return rows;
}

export type BorrowInput = {
  partnerId: string;
  model: string;
  colour: string;
  storage: string;
  condition: string;
  imei: string;
  due: string;
};

/** A phone that is not in stock is borrowed from a partner and recorded with that partner as its source. */
export async function borrowPhone(
  sql: Sql,
  userId: string,
  input: BorrowInput,
): Promise<ShopOk<StockUnit> | ShopFail> {
  const model = input.model.trim();
  const colour = input.colour.trim();
  const storage = input.storage.trim();
  const condition = input.condition.trim();
  const imei = input.imei.trim();
  const due = input.due.trim();
  if (!input.partnerId) {
    return shopFail(400, "Pick the partner this phone came from.");
  }
  if (!model) {
    return shopFail(400, "Name the phone.");
  }
  if (!colour) {
    return shopFail(400, "Enter the colour.");
  }
  if (!storage) {
    return shopFail(400, "Enter the storage.");
  }
  if (!imei) {
    return shopFail(400, "The IMEI is required.");
  }
  const partners = await sql<{ dealer: string }[]>`
    select dealer from partner where id = ${input.partnerId}
  `;
  const partner = partners[0];
  if (!partner) {
    return shopFail(404, "That partner is not recorded.");
  }

  const created = await sql.begin(async (tx) => {
    let code = "";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const next = Array.from({ length: 13 }, () => String(randomInt(0, 10))).join("");
      const taken = await tx<{ id: string }[]>`select id from device where code = ${next} limit 1`;
      if (!taken[0]) {
        code = next;
        break;
      }
    }
    if (!code) {
      return null;
    }
    const rows = await tx<{ id: string }[]>`
      insert into device (
        code, imei, model, colour, storage, condition, status, origin, partner_id, direction, due
      )
      values (
        ${code}, ${imei}, ${model}, ${colour}, ${storage}, ${condition},
        'in stock', 'borrowed', ${input.partnerId}, 'in', ${due || null}
      )
      returning id
    `;
    const id = rows[0]?.id;
    if (!id) {
      return null;
    }
    await tx`
      insert into device_event (device_id, what_happened, who_user_id)
      values (${id}, 'received', ${userId})
    `;
    return { id, code };
  });
  if (!created) {
    return shopFail(500, "Could not give this phone a code. Try again.");
  }
  return {
    ok: true,
    value: { id: created.id, code: created.code, model, colour, storage, condition, source: partner.dealer },
  };
}
