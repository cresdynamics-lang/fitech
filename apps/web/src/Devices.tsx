import { useEffect, useState } from "react";

type DeviceRow = {
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

type DeviceEventRow = {
  whatHappened: string;
  at: string;
  who: string;
};

type DevicePassport = DeviceRow & {
  imei: string;
  serial: string;
  battery: string;
  events: DeviceEventRow[];
};

const ORIGIN: Record<string, string> = {
  new: "New",
  ex_uk: "Ex-UK",
  trade_in: "Trade-in",
  borrowed: "Borrowed",
};

function originLabel(origin: string): string {
  return ORIGIN[origin] ?? origin;
}

function statusLabel(status: string): string {
  const text = status.trim();
  if (!text) {
    return "In stock";
  }
  return text;
}

function phoneTitle(phone: DeviceRow): string {
  return [phone.model, phone.colour, phone.storage].filter(Boolean).join(" ") || phone.code;
}

function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

export function DevicesBoard({
  owner,
  onRegisterBack,
}: {
  owner: boolean;
  onRegisterBack: (handler: (() => boolean) | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [phones, setPhones] = useState<DeviceRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    onRegisterBack(() => {
      if (selectedId) {
        setSelectedId(null);
        return true;
      }
      return false;
    });
    return () => onRegisterBack(null);
  }, [onRegisterBack, selectedId]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void fetch(`/api/devices?q=${encodeURIComponent(query)}`)
        .then(async (response) => {
          if (!response.ok) {
            setError("Devices could not be loaded.");
            return;
          }
          const body = (await response.json()) as { devices?: DeviceRow[] };
          setError("");
          setPhones(body.devices ?? []);
        })
        .catch(() => setError("Devices could not be loaded."));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query]);

  if (selectedId) {
    return <DevicePassportView id={selectedId} owner={owner} onBack={() => setSelectedId(null)} />;
  }

  return (
    <section>
      <h1>Devices</h1>
      <p className="lede">Each phone keeps its own record. Cost and profit on a phone stay with the owner.</p>
      <label className="field">
        Find a phone
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Code, IMEI, name or colour" />
      </label>
      {phones.length === 0 ? <p className="empty">Nothing recorded yet.</p> : null}
      <div className="variant-groups">
        {phones.map((phone) => (
          <button key={phone.id} type="button" className="variant" onClick={() => setSelectedId(phone.id)}>
            <strong>
              {phoneTitle(phone)}
              <small>
                {originLabel(phone.origin)} · {statusLabel(phone.status)}
                {phone.source ? ` · ${phone.source}` : ""}
              </small>
            </strong>
            <span>{phone.code}</span>
          </button>
        ))}
      </div>
      {error ? <p className="sale-block">{error}</p> : null}
    </section>
  );
}

function DevicePassportView({ id, owner, onBack }: { id: string; owner: boolean; onBack: () => void }) {
  const [phone, setPhone] = useState<DevicePassport | null>(null);
  const [value, setValue] = useState<string>("");
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch(`/api/devices/${id}`)
      .then(async (response) => {
        if (!response.ok) {
          setError("That phone could not be loaded.");
          return;
        }
        const body = (await response.json()) as { phone?: DevicePassport; valueOverTime?: string | null };
        setPhone(body.phone ?? null);
        setValue(body.valueOverTime ?? "");
      })
      .catch(() => setError("That phone could not be loaded."));
  }, [id]);

  return (
    <section>
      <button type="button" className="sale-back" onClick={onBack}>
        Back
      </button>
      <h1>{phone ? phoneTitle(phone) : "Device"}</h1>
      {phone ? (
        <>
          <p className="lede">
            {originLabel(phone.origin)} · {statusLabel(phone.status)}
            {phone.source ? ` · Source ${phone.source}` : ""}
          </p>
          <div className="variant">
            <strong>Code</strong>
            <span>{phone.code}</span>
          </div>
          <div className="variant">
            <strong>IMEI</strong>
            <span>{phone.imei}</span>
          </div>
          {phone.serial ? (
            <div className="variant">
              <strong>Serial</strong>
              <span>{phone.serial}</span>
            </div>
          ) : null}
          {phone.condition ? (
            <div className="variant">
              <strong>Condition</strong>
              <span>{phone.condition}</span>
            </div>
          ) : null}
          {phone.battery ? (
            <div className="variant">
              <strong>Battery</strong>
              <span>{phone.battery}</span>
            </div>
          ) : null}
          {owner ? (
            <div className="variant">
              <strong>Value over time</strong>
              <span>{value || "Nothing recorded"}</span>
            </div>
          ) : (
            <p className="hidden-note">Cost, repair cost and profit on this phone are not shown.</p>
          )}
          <h2>What happened</h2>
          {phone.events.length === 0 ? <p className="empty">Nothing recorded yet.</p> : null}
          <div className="variant-groups">
            {phone.events.map((event, index) => (
              <div key={`${event.at}-${index}`} className="variant">
                <strong>
                  {event.whatHappened}
                  <small>{[when(event.at), event.who].filter(Boolean).join(" · ")}</small>
                </strong>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="empty">Nothing recorded yet.</p>
      )}
      {error ? <p className="sale-block">{error}</p> : null}
    </section>
  );
}
