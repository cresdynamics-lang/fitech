import type postgres from "postgres";
import { shopFail, type ShopFail, type ShopOk } from "./stock.js";

type Sql = ReturnType<typeof postgres>;

export type PartnerRow = {
  id: string;
  dealer: string;
  phone: string;
  place: string;
};

export type PartnerPhone = {
  id: string;
  code: string;
  model: string;
  colour: string;
  storage: string;
  condition: string;
  status: string;
  due: string;
  source: string;
};

export async function listPartners(sql: Sql): Promise<{
  partners: PartnerRow[];
  borrowed: PartnerPhone[];
  outWithDealer: PartnerPhone[];
}> {
  const partners = await sql<PartnerRow[]>`
    select id, dealer, coalesce(phone, '') as phone, coalesce(place, '') as place
    from partner
    order by dealer
  `;
  const phones = await sql<(PartnerPhone & { origin: string; direction: string })[]>`
    select d.id, d.code,
      coalesce(d.model, '') as model,
      coalesce(d.colour, '') as colour,
      coalesce(d.storage, '') as storage,
      coalesce(d.condition, '') as condition,
      coalesce(d.status, '') as status,
      coalesce(d.due, '') as due,
      coalesce(p.dealer, '') as source,
      d.origin,
      coalesce(d.direction, '') as direction
    from device d
    left join partner p on p.id = d.partner_id
    where d.origin = 'borrowed'
      or d.direction = 'out'
      or lower(btrim(coalesce(d.status, ''))) = 'with dealer'
    order by p.dealer, d.model, d.code
  `;
  const borrowed = phones
    .filter((phone) => phone.origin === "borrowed")
    .map(strip);
  const outWithDealer = phones
    .filter((phone) => phone.origin !== "borrowed" && (phone.direction === "out" || phone.status.toLowerCase() === "with dealer"))
    .map(strip);
  return { partners, borrowed, outWithDealer };
}

function strip(phone: PartnerPhone & { origin: string; direction: string }): PartnerPhone {
  return {
    id: phone.id,
    code: phone.code,
    model: phone.model,
    colour: phone.colour,
    storage: phone.storage,
    condition: phone.condition,
    status: phone.status,
    due: phone.due,
    source: phone.source,
  };
}

export async function createPartner(
  sql: Sql,
  input: { dealer: string; phone: string; place: string },
): Promise<ShopOk<PartnerRow> | ShopFail> {
  const dealer = input.dealer.trim();
  const phone = input.phone.trim();
  const place = input.place.trim();
  if (!dealer) {
    return shopFail(400, "Enter the partner's name.");
  }
  const rows = await sql<PartnerRow[]>`
    insert into partner (dealer, phone, place)
    values (${dealer}, ${phone || null}, ${place || null})
    returning id, dealer, coalesce(phone, '') as phone, coalesce(place, '') as place
  `;
  const created = rows[0];
  if (!created) {
    return shopFail(500, "The partner was not saved.");
  }
  return { ok: true, value: created };
}
