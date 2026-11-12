import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

export type MoneyAmount = {
  amountKes: number;
  count: number;
};

export type MoneyPicture = {
  period: "month" | "last";
  moneyIn: MoneyAmount | null;
  salesMade: null;
  discounts: null;
  moneyOut: {
    rent: null;
    power: null;
    salaries: null;
    marketing: null;
    delivery: null;
    other: null;
  };
  profit: {
    netSales: null;
    costOfPhonesSold: null;
    grossProfit: null;
    expenses: null;
    netProfit: null;
  };
  lipaOutstanding: null;
  stockValueAtCost: MoneyAmount | null;
};

/** Owner picture. A missing figure is null, never a made-up zero. */
export async function moneyPicture(sql: Sql, period: "month" | "last"): Promise<MoneyPicture> {
  const payments = await sql<{ count: number; total: number }[]>`
    select count(*)::int as count, coalesce(sum(amount_kes), 0)::int as total
    from payment_record
    where created_at >= case
        when ${period} = 'last' then date_trunc('month', now() - interval '1 month')
        else date_trunc('month', now())
      end
      and created_at < case
        when ${period} = 'last' then date_trunc('month', now())
        else now() + interval '1 second'
      end
  `;
  const received = payments[0];
  const stock = await sql<{ count: number; total: number }[]>`
    select count(c.id)::int as count, coalesce(sum(c.amount_kes), 0)::int as total
    from device_cost_entry c
    join device d on d.id = c.device_id
    where d.status is null
      or btrim(d.status) = ''
      or lower(btrim(d.status)) <> 'sold'
  `;
  const held = stock[0];
  return {
    period,
    moneyIn: received && received.count > 0 ? { amountKes: received.total, count: received.count } : null,
    salesMade: null,
    discounts: null,
    moneyOut: { rent: null, power: null, salaries: null, marketing: null, delivery: null, other: null },
    profit: { netSales: null, costOfPhonesSold: null, grossProfit: null, expenses: null, netProfit: null },
    lipaOutstanding: null,
    stockValueAtCost: held && held.count > 0 ? { amountKes: held.total, count: held.count } : null,
  };
}
