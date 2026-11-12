import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

export type DeviceRow = {
  id: string;
  code: string;
  model: string;
  colour: string;
  storage: string;
  condition: string;
  status: string;
  origin: string;
  source: string;
};

export type DeviceEventRow = {
  whatHappened: string;
  at: string;
  who: string;
};

export type DevicePassport = DeviceRow & {
  imei: string;
  serial: string;
  battery: string;
  events: DeviceEventRow[];
};

/** Every phone keeps its own record. Cost is not included. */
export async function listDevices(sql: Sql, query: string): Promise<DeviceRow[]> {
  const term = query.trim();
  const like = `%${term}%`;
  return sql<DeviceRow[]>`
    select d.id, d.code,
      coalesce(d.model, '') as model,
      coalesce(d.colour, '') as colour,
      coalesce(d.storage, '') as storage,
      coalesce(d.condition, '') as condition,
      coalesce(d.status, '') as status,
      d.origin,
      coalesce(p.dealer, '') as source
    from device d
    left join partner p on p.id = d.partner_id
    where (
      ${term} = ''
      or d.model ilike ${like}
      or d.code ilike ${like}
      or d.imei ilike ${like}
      or coalesce(d.colour, '') ilike ${like}
    )
    order by d.created_at desc, d.code
  `;
}

export async function devicePassport(sql: Sql, id: string): Promise<DevicePassport | null> {
  const rows = await sql<Omit<DevicePassport, "events">[]>`
    select d.id, d.code, d.imei,
      coalesce(d.serial, '') as serial,
      coalesce(d.model, '') as model,
      coalesce(d.colour, '') as colour,
      coalesce(d.storage, '') as storage,
      coalesce(d.condition, '') as condition,
      coalesce(d.battery, '') as battery,
      coalesce(d.status, '') as status,
      d.origin,
      coalesce(p.dealer, '') as source
    from device d
    left join partner p on p.id = d.partner_id
    where d.id = ${id}
  `;
  const phone = rows[0];
  if (!phone) {
    return null;
  }
  const events = await sql<{ whatHappened: string; at: Date; who: string }[]>`
    select e.what_happened as "whatHappened", e.created_at as at, coalesce(u.name, '') as who
    from device_event e
    left join app_user u on u.id = e.who_user_id
    where e.device_id = ${id}
    order by e.created_at asc
  `;
  return {
    ...phone,
    events: events.map((event) => ({
      whatHappened: event.whatHappened,
      at: event.at.toISOString(),
      who: event.who,
    })),
  };
}
