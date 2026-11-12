import { useEffect, useState } from "react";

export type StockUnit = {
  id: string;
  code: string;
  model: string;
  colour: string;
  storage: string;
  condition: string;
  source: string;
};

export function variantText(unit: StockUnit): string {
  return [unit.colour, unit.storage, unit.condition].map((part) => part.trim()).filter(Boolean).join(" · ");
}

export function phoneLabel(unit: StockUnit): string {
  const variant = variantText(unit);
  return variant ? `${unit.model} · ${variant}` : unit.model;
}

export function groupStock(units: StockUnit[]): Array<{ name: string; units: StockUnit[] }> {
  const groups = new Map<string, StockUnit[]>();
  for (const unit of units) {
    const name = unit.model.trim() || "No name";
    const list = groups.get(name) ?? [];
    list.push(unit);
    groups.set(name, list);
  }
  return [...groups].map(([name, list]) => ({ name, units: list }));
}

export function StockVariants({
  units,
  pickedId,
  onPick,
  onSell,
}: {
  units: StockUnit[];
  pickedId?: string;
  onPick?: (unit: StockUnit) => void;
  onSell?: (unit: StockUnit) => void;
}) {
  const groups = groupStock(units);
  if (groups.length === 0) {
    return null;
  }
  return (
    <div className="variant-groups">
      {groups.map((group) => (
        <section key={group.name} className="variant-group">
          <h3>{group.name}</h3>
          {group.units.map((unit) => {
            const variant = variantText(unit) || "No variant recorded";
            const choose = onPick ?? onSell;
            if (!choose) {
              return (
                <div key={unit.id} className="variant">
                  <strong>
                    {variant}
                    {unit.source ? <small>Source: {unit.source}</small> : null}
                  </strong>
                  <span>{unit.code}</span>
                </div>
              );
            }
            return (
              <button
                key={unit.id}
                type="button"
                className={pickedId === unit.id ? "variant on" : "variant"}
                onClick={() => choose(unit)}
              >
                <strong>
                  {variant}
                  {unit.source ? <small>Source: {unit.source}</small> : null}
                </strong>
                <span>{unit.code}</span>
                {onSell ? <em>Sell</em> : null}
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}

export function useStock(name: string, enabled: boolean): StockUnit[] {
  const [units, setUnits] = useState<StockUnit[]>([]);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const handle = window.setTimeout(() => {
      void fetch(`/api/stock?name=${encodeURIComponent(name)}`)
        .then(async (response) => {
          if (!response.ok) {
            setUnits([]);
            return;
          }
          const body = (await response.json()) as { stock?: StockUnit[] };
          setUnits(body.stock ?? []);
        })
        .catch(() => setUnits([]));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [name, enabled]);
  return units;
}

export function StockBoard({ onSell }: { onSell?: (unit: StockUnit) => void }) {
  const [name, setName] = useState("");
  const units = useStock(name, true);
  return (
    <section>
      <h1>Inventory</h1>
      <p className="lede">What is in stock. A sale uses one of these phones.</p>
      <label className="field">
        Name
        <input value={name} placeholder="Search stock by name" onChange={(event) => setName(event.target.value)} />
      </label>
      {units.length === 0 ? (
        <p className="empty">{name.trim() ? "Nothing in stock matches that name." : "Nothing is in stock."}</p>
      ) : (
        <StockVariants units={units} onSell={onSell} />
      )}
    </section>
  );
}
