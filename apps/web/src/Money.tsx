import { useEffect, useState } from "react";

type MoneyAmount = { amountKes: number; count: number };

type MoneyPicture = {
  period: "month" | "last";
  moneyIn: MoneyAmount | null;
  salesMade: null;
  discounts: null;
  moneyOut: Record<string, null>;
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

const OUT: { key: string; label: string }[] = [
  { key: "rent", label: "Rent" },
  { key: "power", label: "Power" },
  { key: "salaries", label: "Salaries" },
  { key: "marketing", label: "Marketing" },
  { key: "delivery", label: "Delivery" },
  { key: "other", label: "Other" },
];

function figure(amount: MoneyAmount | null): string {
  if (!amount) {
    return "Nothing recorded";
  }
  return `KES ${amount.amountKes.toLocaleString("en-KE")}`;
}

export function MoneyBoard() {
  const [period, setPeriod] = useState<"month" | "last">("month");
  const [picture, setPicture] = useState<MoneyPicture | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch(`/api/money?period=${period}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setError(body?.error ?? "Money could not be loaded.");
          setPicture(null);
          return;
        }
        setError("");
        setPicture((await response.json()) as MoneyPicture);
      })
      .catch(() => setError("Money could not be loaded."));
  }, [period]);

  return (
    <section>
      <h1>Money</h1>
      <p className="lede">Money in, money out, and the profit calculated from what is recorded. Owner only.</p>
      <div className="sale-links">
        <button type="button" className={period === "month" ? "sale-next" : ""} onClick={() => setPeriod("month")}>
          This month
        </button>
        <button type="button" className={period === "last" ? "sale-next" : ""} onClick={() => setPeriod("last")}>
          Last month
        </button>
      </div>
      <h2>Money in</h2>
      <div className="tiles">
        <article className="tile">
          <h2>Money received</h2>
          <p>{figure(picture?.moneyIn ?? null)}</p>
        </article>
        <article className="tile">
          <h2>Sales made</h2>
          <p>Nothing recorded</p>
        </article>
        <article className="tile">
          <h2>Discounts</h2>
          <p>Nothing recorded</p>
        </article>
      </div>
      <h2>Money out</h2>
      <div className="tiles">
        {OUT.map((item) => (
          <article key={item.key} className="tile">
            <h2>{item.label}</h2>
            <p>Nothing recorded</p>
          </article>
        ))}
      </div>
      <h2>Profit</h2>
      <p className="empty">
        Net sales is sales minus discounts. Gross profit is net sales minus the landed cost of the phones sold. Net
        profit is gross profit minus rent, power, salaries, marketing, delivery and other. Lipa still owed is not
        profit.
      </p>
      <div className="tiles">
        <article className="tile">
          <h2>Net sales</h2>
          <p>Nothing recorded</p>
        </article>
        <article className="tile">
          <h2>Cost of phones sold</h2>
          <p>Nothing recorded</p>
        </article>
        <article className="tile">
          <h2>Gross profit</h2>
          <p>Nothing recorded</p>
        </article>
        <article className="tile">
          <h2>Expenses</h2>
          <p>Nothing recorded</p>
        </article>
        <article className="tile">
          <h2>Net profit</h2>
          <p>Nothing recorded</p>
        </article>
      </div>
      <h2>How the business is</h2>
      <div className="tiles">
        <article className="tile">
          <h2>Lipa outstanding</h2>
          <p>Nothing recorded</p>
        </article>
        <article className="tile">
          <h2>Stock value at cost</h2>
          <p>{figure(picture?.stockValueAtCost ?? null)}</p>
        </article>
        <article className="tile">
          <h2>{period === "last" ? "Last month" : "This month"} against the month before</h2>
          <p>Nothing recorded</p>
        </article>
      </div>
      {error ? <p className="sale-block">{error}</p> : null}
    </section>
  );
}
