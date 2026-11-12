import { useEffect, useState, type FormEvent } from "react";
import type { StockUnit } from "./StockPick";

export type ShopPartner = {
  id: string;
  dealer: string;
  phone: string;
  place: string;
};

type PartnerPhone = {
  id: string;
  code: string;
  model: string;
  colour: string;
  storage: string;
  status: string;
  due: string;
  source: string;
};

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "That could not be saved.";
}

export function AskPartner({
  canAdd,
  onBorrowed,
}: {
  canAdd: boolean;
  onBorrowed: (unit: StockUnit) => void;
}) {
  const [partners, setPartners] = useState<ShopPartner[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [dealer, setDealer] = useState("");
  const [partnerPhone, setPartnerPhone] = useState("");
  const [place, setPlace] = useState("");
  const [model, setModel] = useState("");
  const [colour, setColour] = useState("");
  const [storage, setStorage] = useState("");
  const [condition, setCondition] = useState("");
  const [imei, setImei] = useState("");
  const [due, setDue] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    void fetch("/api/partners")
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as { partners?: ShopPartner[] };
        setPartners(body.partners ?? []);
      })
      .catch(() => setPartners([]));
  }

  useEffect(load, []);

  const partner = partners.find((item) => item.id === partnerId);

  async function addPartner() {
    setSaving(true);
    setError("");
    const response = await fetch("/api/partners", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dealer, phone: partnerPhone, place }),
    });
    setSaving(false);
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    const body = (await response.json()) as { partner: ShopPartner };
    setPartners((list) => [...list, body.partner].sort((a, b) => a.dealer.localeCompare(b.dealer)));
    setPartnerId(body.partner.id);
    setDealer("");
    setPartnerPhone("");
    setPlace("");
    setAdding(false);
  }

  async function borrow() {
    if (!partnerId) {
      setError("Pick the partner this phone came from.");
      return;
    }
    setSaving(true);
    setError("");
    const response = await fetch("/api/stock/borrow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ partnerId, model, colour, storage, condition, imei, due }),
    });
    setSaving(false);
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    const body = (await response.json()) as { phone: StockUnit };
    onBorrowed(body.phone);
  }

  return (
    <div className="partner-ask">
      <p className="empty">Pick the partner. The phone is borrowed in, and that partner is where it came from.</p>
      {partners.length === 0 ? <p className="empty">No partners yet.</p> : null}
      <div className="variant-groups">
        {partners.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === partnerId ? "variant on" : "variant"}
            onClick={() => setPartnerId(item.id)}
          >
            <strong>{item.dealer}</strong>
            <span>{[item.phone, item.place].filter(Boolean).join(" · ") || "No phone or place"}</span>
          </button>
        ))}
      </div>
      {canAdd ? (
        adding ? (
          <div>
            <label className="field">
              Partner
              <input value={dealer} onChange={(event) => setDealer(event.target.value)} />
            </label>
            <label className="field">
              Phone
              <input value={partnerPhone} onChange={(event) => setPartnerPhone(event.target.value)} />
            </label>
            <label className="field">
              Place
              <input value={place} onChange={(event) => setPlace(event.target.value)} />
            </label>
            <div className="sale-actions">
              <button type="button" className="sale-next" disabled={saving} onClick={() => void addPartner()}>
                Add partner
              </button>
              <button type="button" className="sale-back" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="sale-links">
            <button type="button" onClick={() => setAdding(true)}>
              Add partner
            </button>
          </div>
        )
      ) : null}
      {partner ? (
        <div>
          <p className="picked-phone">
            <strong>Source</strong>
            <span>{partner.dealer}</span>
          </p>
          <label className="field">
            Name
            <input value={model} onChange={(event) => setModel(event.target.value)} />
          </label>
          <label className="field">
            Colour
            <input value={colour} onChange={(event) => setColour(event.target.value)} />
          </label>
          <label className="field">
            Storage
            <input value={storage} onChange={(event) => setStorage(event.target.value)} />
          </label>
          <label className="field">
            Condition
            <input value={condition} onChange={(event) => setCondition(event.target.value)} />
          </label>
          <label className="field">
            IMEI
            <input value={imei} onChange={(event) => setImei(event.target.value)} />
          </label>
          <label className="field">
            Return by, if it is not sold
            <input value={due} onChange={(event) => setDue(event.target.value)} />
          </label>
          <div className="sale-actions">
            <button type="button" className="sale-next" disabled={saving} onClick={() => void borrow()}>
              Borrow this phone
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="sale-block">{error}</p> : null}
    </div>
  );
}

export function PartnersBoard({ canAdd }: { canAdd: boolean }) {
  const [partners, setPartners] = useState<ShopPartner[]>([]);
  const [borrowed, setBorrowed] = useState<PartnerPhone[]>([]);
  const [outWithDealer, setOutWithDealer] = useState<PartnerPhone[]>([]);
  const [dealer, setDealer] = useState("");
  const [phone, setPhone] = useState("");
  const [place, setPlace] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  function load() {
    void fetch("/api/partners")
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as {
          partners?: ShopPartner[];
          borrowed?: PartnerPhone[];
          outWithDealer?: PartnerPhone[];
        };
        setPartners(body.partners ?? []);
        setBorrowed(body.borrowed ?? []);
        setOutWithDealer(body.outWithDealer ?? []);
      })
      .catch(() => undefined);
  }

  useEffect(load, []);

  async function add(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/partners", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dealer, phone, place }),
    });
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    setDealer("");
    setPhone("");
    setPlace("");
    setAdding(false);
    load();
  }

  return (
    <section>
      <h1>Partners</h1>
      <p className="lede">Dealers take phones to sell, or lend phones to us, and nothing loses its identity.</p>
      <h2>Out</h2>
      <p className="empty">
        A dealer takes one of our phones to sell and pays the agreed price when it is sold, or returns it. Amounts are
        for the owner.
      </p>
      {outWithDealer.length === 0 ? <p className="empty">Nothing is out with a dealer.</p> : <PhoneList phones={outWithDealer} />}
      <h2>Borrowed in</h2>
      <p className="empty">
        We borrow a phone for a client who wants a specific one. It gets its own record and a 13-digit code, and the
        partner is where it came from.
      </p>
      {borrowed.length === 0 ? <p className="empty">Nothing is borrowed in.</p> : <PhoneList phones={borrowed} />}
      <h2>Partners</h2>
      {partners.length === 0 ? <p className="empty">No partners yet.</p> : null}
      <div className="variant-groups">
        {partners.map((item) => (
          <div key={item.id} className="variant">
            <strong>{item.dealer}</strong>
            <span>{[item.phone, item.place].filter(Boolean).join(" · ") || "No phone or place"}</span>
          </div>
        ))}
      </div>
      {canAdd ? (
        adding ? (
          <form onSubmit={(event) => void add(event)}>
            <label className="field">
              Partner
              <input value={dealer} onChange={(event) => setDealer(event.target.value)} />
            </label>
            <label className="field">
              Phone
              <input value={phone} onChange={(event) => setPhone(event.target.value)} />
            </label>
            <label className="field">
              Place
              <input value={place} onChange={(event) => setPlace(event.target.value)} />
            </label>
            {error ? <p className="sale-block">{error}</p> : null}
            <div className="sale-actions">
              <button type="submit" className="sale-next">
                Add partner
              </button>
              <button type="button" className="sale-back" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="sale-links">
            <button type="button" onClick={() => setAdding(true)}>
              Add partner
            </button>
          </div>
        )
      ) : null}
    </section>
  );
}

function PhoneList({ phones }: { phones: PartnerPhone[] }) {
  return (
    <div className="variant-groups">
      {phones.map((phone) => (
        <div key={phone.id} className="variant">
          <strong>
            {[phone.model, phone.colour, phone.storage].filter(Boolean).join(" · ") || "Phone"}
            <small>Source: {phone.source || "No partner"}</small>
          </strong>
          <span>{[phone.code, phone.status, phone.due].filter(Boolean).join(" · ")}</span>
        </div>
      ))}
    </div>
  );
}
