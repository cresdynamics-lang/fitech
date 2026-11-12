import { useEffect, useState, type FormEvent } from "react";
import { buildShopPdf, FITECH_SHOP } from "shared";
import { AskPartner } from "./Partners";
import { phoneLabel, StockVariants, useStock, type StockUnit } from "./StockPick";

type Path = "full" | "lipa" | "trade";
type Method = "cash" | "mpesa" | "bank" | "card";
type Handover = "collect" | "deliver";
type View = "compose" | "lipa" | "trade" | "pay" | "done";

const MONTHS = [1, 2, 3, 4, 5, 6] as const;

export function NewSale({
  sellerName,
  roleLabel,
  owner,
  canAddPartner,
  onBack,
  onRegisterBack,
  initialUnit = null,
}: {
  sellerName: string;
  roleLabel: string;
  owner: boolean;
  canAddPartner: boolean;
  onBack: () => void;
  onRegisterBack: (handler: (() => boolean) | null) => void;
  initialUnit?: StockUnit | null;
}) {
  const [view, setView] = useState<View>("compose");
  const [mobileStep, setMobileStep] = useState<1 | 2 | 3>(1);
  const [picked, setPicked] = useState<StockUnit | null>(initialUnit);
  const [nameQuery, setNameQuery] = useState("");
  const [code, setCode] = useState(initialUnit?.code ?? "");
  const [phone, setPhone] = useState(initialUnit ? phoneLabel(initialUnit) : "");
  const [source, setSource] = useState(initialUnit?.source ?? "");
  const [price, setPrice] = useState("");
  const [discount, setDiscount] = useState("");
  const [askPartner, setAskPartner] = useState(false);
  const [client, setClient] = useState("");
  const [email, setEmail] = useState("");
  const [heard, setHeard] = useState("");
  const [path, setPath] = useState<Path | "">("");
  const [months, setMonths] = useState<number>(1);
  const [hasId, setHasId] = useState(false);
  const [hasReceipt, setHasReceipt] = useState(false);
  const [hasBox, setHasBox] = useState(false);
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<Method | "">("");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [handover, setHandover] = useState<Handover | "">("");
  const [address, setAddress] = useState("");
  const [riderFee, setRiderFee] = useState("");
  const [block, setBlock] = useState("");
  const matches = useStock(nameQuery, !askPartner && nameQuery.trim().length > 0);

  const selling = whole(price);
  const off = whole(discount);
  const toPay = selling === null ? null : Math.max(0, selling - (off ?? 0));
  const deposit = selling === null ? null : Math.round(selling * 0.4);
  const balance = selling === null || deposit === null ? null : selling - deposit;

  function reset() {
    setView("compose");
    setMobileStep(1);
    setPicked(null);
    setNameQuery("");
    setCode("");
    setPhone("");
    setSource("");
    setPrice("");
    setDiscount("");
    setAskPartner(false);
    setClient("");
    setEmail("");
    setHeard("");
    setPath("");
    setMonths(1);
    setHasId(false);
    setHasReceipt(false);
    setHasBox(false);
    setReason("");
    setMethod("");
    setReference("");
    setAmount("");
    setHandover("");
    setAddress("");
    setRiderFee("");
    setBlock("");
  }

  function composeReady(): string {
    if (askPartner && !picked) {
      return "Pick a partner and record the phone.";
    }
    if (!askPartner && !picked) {
      return "Choose a phone from stock.";
    }
    if (!client.trim() || !email.trim()) {
      return "The client and email are required.";
    }
    if (!path) {
      return "Choose how the client will pay.";
    }
    return "";
  }

  function continueSale(event: FormEvent) {
    event.preventDefault();
    const problem = composeReady();
    setBlock(problem);
    if (problem) {
      return;
    }
    if (path === "lipa") {
      setView("lipa");
      return;
    }
    if (path === "trade") {
      setView("trade");
      return;
    }
    setView("pay");
  }

  function continueTrade(event: FormEvent) {
    event.preventDefault();
    if ((!hasReceipt || !hasBox) && !reason.trim()) {
      setBlock("Accepting without a receipt or box needs a reason.");
      return;
    }
    setBlock("");
    setView("pay");
  }

  function confirm(event: FormEvent) {
    event.preventDefault();
    if (!method) {
      setBlock("Choose how the client paid.");
      return;
    }
    if (method === "mpesa" && !reference.trim()) {
      setBlock("M-Pesa needs the confirmation code.");
      return;
    }
    if (method === "bank" && !reference.trim()) {
      setBlock("Bank transfer needs the reference.");
      return;
    }
    if (!amount.trim()) {
      setBlock("Enter the amount received.");
      return;
    }
    if (!handover) {
      setBlock("Choose collect from the shop or deliver.");
      return;
    }
    if (handover === "deliver" && !address.trim()) {
      setBlock("Delivery needs the area or address.");
      return;
    }
    setBlock("");
    setView("done");
  }

  const seller = `${sellerName} · ${roleLabel}`;

  function stepBack(): boolean {
    if (view === "done") {
      setView("pay");
      return true;
    }
    if (view === "pay") {
      setView(path === "lipa" ? "lipa" : path === "trade" ? "trade" : "compose");
      return true;
    }
    if (view === "lipa" || view === "trade") {
      setView("compose");
      return true;
    }
    if (window.matchMedia("(max-width: 767px)").matches && mobileStep > 1) {
      setMobileStep((step) => (step === 3 ? 2 : 1));
      return true;
    }
    return false;
  }

  useEffect(() => {
    onRegisterBack(stepBack);
    return () => onRegisterBack(null);
  });

  if (view === "done") {
    const letterhead = [
      FITECH_SHOP.name,
      FITECH_SHOP.place,
      FITECH_SHOP.email,
      FITECH_SHOP.phone,
      FITECH_SHOP.websiteLabel,
    ];
    const recorded = [
      `Client recorded by ${seller}`,
      `Client: ${client.trim()}`,
      `Client email: ${email.trim()}`,
      `Phone: ${phone.trim() || code.trim()}`,
      source.trim() ? `Source: ${source.trim()}` : "",
      code.trim() ? `Code: ${code.trim()}` : "",
      `Paid by: ${methodLabel(method)}`,
      `Amount received: ${amount.trim()}`,
      handover === "deliver" ? `Deliver: ${address.trim()}` : "Collect from shop",
    ].filter(Boolean);
    return (
      <section className="sale-done">
        <h1>Sale complete</h1>
        <p className="lede">
          {sellerName} recorded {client.trim()} The receipt and the invoice use Fitech's details.
        </p>
        <article className="paper">
          <ShopMark />
          <h2>Receipt</h2>
          <DocumentFacts lines={recorded} />
          <button type="button" className="sale-next" onClick={() => savePdf("fitech-receipt.pdf", [...letterhead, "", "Receipt", ...recorded])}>
            Receipt PDF
          </button>
        </article>
        <article className="paper">
          <ShopMark />
          <h2>Invoice</h2>
          <DocumentFacts lines={[...recorded, "The phone on this invoice stays linked to the code above."]} />
          <button type="button" className="sale-next" onClick={() => savePdf("fitech-invoice.pdf", [...letterhead, "", "Invoice", ...recorded, "The phone on this invoice stays linked to the code above."])}>
            Invoice PDF
          </button>
        </article>
        <article className="paper">
          <h2>Message to the client</h2>
          <p>From {FITECH_SHOP.email}</p>
          <p>Phone {FITECH_SHOP.phone}</p>
          <p>
            <a href={FITECH_SHOP.website}>{FITECH_SHOP.websiteLabel}</a>
          </p>
          <p>To {email.trim()}</p>
          <p>Your Fitech receipt for {client.trim()}</p>
          <p className="hidden-note">Prepared on this screen. It has not been emailed.</p>
        </article>
        <p className="hidden-note">Nothing was written to the shop records from this screen.</p>
        <div className="sale-actions">
          <button type="button" className="sale-back" onClick={onBack}>
            Back
          </button>
          <button type="button" className="sale-next" onClick={reset}>
            New sale
          </button>
        </div>
      </section>
    );
  }

  if (view === "lipa") {
    return (
      <section className="sale">
        <h1>Lipa Mdogo Mdogo</h1>
        <p className="lede">40% deposit today. The balance is paid over 1 to 6 months.</p>
        <div className="sale-split">
          <p>Deposit (40%)</p>
          <strong>{deposit === null ? "Enter the selling price" : `KES ${deposit.toLocaleString("en-KE")}`}</strong>
        </div>
        <div className="sale-split">
          <p>Balance</p>
          <strong>{balance === null ? "—" : `KES ${balance.toLocaleString("en-KE")}`}</strong>
        </div>
        <div className="month-row" role="group" aria-label="Months">
          {MONTHS.map((month) => (
            <button
              key={month}
              type="button"
              className={months === month ? "month on" : "month"}
              onClick={() => setMonths(month)}
            >
              {month}
            </button>
          ))}
        </div>
        <p className="lede">{months} {months === 1 ? "month" : "months"}</p>
        <div className="sale-actions">
          <button type="button" className="sale-back" onClick={onBack}>
            Back
          </button>
          <button type="button" className="sale-next" onClick={() => setView("pay")}>
            Record deposit
          </button>
        </div>
      </section>
    );
  }

  if (view === "trade") {
    return (
      <form className="sale" onSubmit={continueTrade}>
        <h1>Trade-in checks</h1>
        <p className="lede">ID, receipt and box. Missing a receipt or a box needs a reason.</p>
        <label className="check-row">
          <input type="checkbox" checked={hasId} onChange={(event) => setHasId(event.target.checked)} />
          ID matches the client
        </label>
        <label className="check-row">
          <input type="checkbox" checked={hasReceipt} onChange={(event) => setHasReceipt(event.target.checked)} />
          Receipt
        </label>
        <label className="check-row">
          <input type="checkbox" checked={hasBox} onChange={(event) => setHasBox(event.target.checked)} />
          Box
        </label>
        {!hasReceipt || !hasBox ? (
          <label className="field">
            Reason
            <input value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
        ) : null}
        {block ? <p className="sale-block">{block}</p> : null}
        <div className="sale-actions">
          <button type="button" className="sale-back" onClick={onBack}>
            Back
          </button>
          <button type="submit" className="sale-next">
            Continue to payment
          </button>
        </div>
      </form>
    );
  }

  if (view === "pay") {
    return (
      <form className="sale" onSubmit={confirm}>
        <h1>Confirm payment</h1>
        <p className="lede">How did the client pay?</p>
        <div className="pay-methods">
          <PayChoice
            current={method}
            value="cash"
            title="Cash"
            detail="Counted at the till"
            onPick={(value) => {
              setMethod(value);
              setReference("");
              setBlock("");
            }}
          />
          <PayChoice
            current={method}
            value="mpesa"
            title="M-Pesa"
            detail="Code required"
            onPick={(value) => {
              setMethod(value);
              setReference("");
              setBlock("");
            }}
          />
          <PayChoice
            current={method}
            value="bank"
            title="Bank transfer"
            detail="Reference required"
            onPick={(value) => {
              setMethod(value);
              setReference("");
              setBlock("");
            }}
          />
          <PayChoice
            current={method}
            value="card"
            title="Card"
            detail="Recorded, not charged by the app"
            onPick={(value) => {
              setMethod(value);
              setReference("");
              setBlock("");
            }}
          />
        </div>
        {method === "mpesa" ? (
          <label className="field">
            M-Pesa confirmation code
            <input value={reference} onChange={(event) => setReference(event.target.value)} />
          </label>
        ) : null}
        {method === "bank" ? (
          <label className="field">
            Bank reference
            <input value={reference} onChange={(event) => setReference(event.target.value)} />
          </label>
        ) : null}
        <label className="field">
          Amount received
          <input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label className="field">
          Sold by (locked)
          <input value={seller} readOnly />
        </label>
        <label className="field">
          Heard about us from
          <input value={heard} onChange={(event) => setHeard(event.target.value)} />
        </label>
        <p className="lede">How does the client get it?</p>
        <div className="pay-methods">
          <button type="button" className={handover === "collect" ? "path on" : "path"} onClick={() => { setHandover("collect"); setBlock(""); }}>
            <strong>Collect from shop</strong>
            <span>Handed over now</span>
          </button>
          <button type="button" className={handover === "deliver" ? "path on" : "path"} onClick={() => { setHandover("deliver"); setBlock(""); }}>
            <strong>Deliver</strong>
            <span>Rider, address, fee</span>
          </button>
        </div>
        {handover === "deliver" ? (
          <>
            <label className="field">
              Area / address
              <input value={address} onChange={(event) => setAddress(event.target.value)} />
            </label>
            {owner ? (
              <label className="field">
                Rider fee
                <input inputMode="numeric" value={riderFee} onChange={(event) => setRiderFee(event.target.value)} />
              </label>
            ) : (
              <p className="hidden-note">The rider fee is not shown to you.</p>
            )}
          </>
        ) : null}
        <div className="sale-card">
          <p>Client</p>
          <strong>{client || "—"}</strong>
          <p>Client email</p>
          <strong>{email || "—"}</strong>
        </div>
        {block ? <p className="sale-block">{block}</p> : null}
        <div className="sale-actions">
          <button type="button" className="sale-back" onClick={onBack}>
            Back
          </button>
          <button type="submit" className="sale-next">
            Confirm sale
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className="sale sale-compose" data-step={mobileStep} onSubmit={continueSale}>
      <div className="sale-main">
        <button type="button" className="sale-back" onClick={onBack}>
          Back
        </button>
        <h1>New sale</h1>
        <p className="lede">A phone from stock, then the client, then the payment path.</p>
        <section className={mobileStep === 1 ? "sale-step current" : "sale-step"}>
          <h2>Step 1 · The phone leaves stock on confirm</h2>
          {picked && !askPartner ? (
            <p className="picked-phone">
              <strong>{phone}</strong>
              <span>{code}</span>
              {source ? <span>Source: {source}</span> : null}
            </p>
          ) : null}
          {askPartner ? (
            <AskPartner
              canAdd={canAddPartner}
              onBorrowed={(unit) => {
                setPicked(unit);
                setCode(unit.code);
                setPhone(phoneLabel(unit));
                setSource(unit.source);
                setAskPartner(false);
                setBlock("");
              }}
            />
          ) : (
            <label className="field">
              Name
              <input
                value={nameQuery}
                onChange={(event) => setNameQuery(event.target.value)}
                placeholder="Search stock by name"
              />
            </label>
          )}
          <label className="field">
            Selling price
            <input inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value)} />
          </label>
          {!askPartner && nameQuery.trim() ? (
            matches.length > 0 ? (
              <StockVariants
                units={matches}
                pickedId={picked?.id}
                onPick={(unit) => {
                  setPicked(unit);
                  setCode(unit.code);
                  setPhone(phoneLabel(unit));
                  setSource(unit.source);
                  setAskPartner(false);
                }}
              />
            ) : (
              <p className="empty">Nothing in stock matches that name.</p>
            )
          ) : null}
          <div className="sale-links">
            <button
              type="button"
              onClick={() => {
                setAskPartner(true);
                setPicked(null);
                setCode("");
                setPhone("");
                setSource("");
              }}
            >
              Not in stock? Ask a partner
            </button>
          </div>
          <p className="hidden-note">A locked, on hold or already sold phone is not in this list.</p>
        </section>
        <section className={mobileStep === 2 ? "sale-step current" : "sale-step"}>
          <h2>Step 2 · Client required</h2>
          <label className="field">
            Client
            <input value={client} onChange={(event) => setClient(event.target.value)} />
          </label>
          <label className="field">
            Client email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="field">
            Sold by (locked)
            <input value={seller} readOnly />
          </label>
          <label className="field">
            Heard about us from
            <input value={heard} onChange={(event) => setHeard(event.target.value)} />
          </label>
        </section>
        <section className={mobileStep === 3 ? "sale-step current" : "sale-step"}>
          <h2>Step 3 · How will the client pay?</h2>
          <div className="paths">
            <button type="button" className={path === "full" ? "path on" : "path"} onClick={() => setPath("full")}>
              <strong>Full payment</strong>
              <span>Cash · Bank transfer · Card · M-Pesa send money</span>
            </button>
            <button type="button" className={path === "lipa" ? "path on" : "path"} onClick={() => setPath("lipa")}>
              <strong>Lipa Mdogo Mdogo</strong>
              <span>40% deposit today · balance over 1 to 6 months</span>
            </button>
            <button type="button" className={path === "trade" ? "path on" : "path"} onClick={() => setPath("trade")}>
              <strong>Trade-in plus top-up</strong>
              <span>Client brings a phone and adds money</span>
            </button>
          </div>
        </section>
      </div>
      <aside className="sale-summary">
        <p>Phone</p>
        <strong>{phone.trim() || code.trim() || "No phone yet"}</strong>
        {source ? (
          <>
            <p>Source</p>
            <strong>{source}</strong>
          </>
        ) : null}
        <p>Discount</p>
        <input inputMode="numeric" value={discount} onChange={(event) => setDiscount(event.target.value)} placeholder="0" />
        <p>To pay today</p>
        <strong>{toPay === null ? "Enter the selling price" : `KES ${toPay.toLocaleString("en-KE")}`}</strong>
        {block ? <p className="sale-block">{block}</p> : null}
        <div className="mobile-steps">
          {mobileStep > 1 ? (
            <button type="button" className="sale-back" onClick={onBack}>
              Back
            </button>
          ) : null}
          {mobileStep < 3 ? (
            <button
              type="button"
              className="sale-next"
              onClick={() => {
                if (mobileStep === 1 && !picked && !askPartner) {
                  setBlock("Choose a phone from stock.");
                  return;
                }
                if (mobileStep === 1 && askPartner && !picked) {
                  setBlock("Pick a partner and record the phone.");
                  return;
                }
                if (mobileStep === 2 && (!client.trim() || !email.trim())) {
                  setBlock("The client and email are required.");
                  return;
                }
                setBlock("");
                setMobileStep((step) => (step === 1 ? 2 : 3));
              }}
            >
              Continue
            </button>
          ) : null}
        </div>
        <button type="submit" className="sale-next desktop-continue">
          Continue to payment
        </button>
      </aside>
    </form>
  );
}

function ShopMark() {
  return (
    <header className="shop-mark">
      <strong>{FITECH_SHOP.name}</strong>
      <span>{FITECH_SHOP.place}</span>
      <a href={`mailto:${FITECH_SHOP.email}`}>{FITECH_SHOP.email}</a>
      <a href="tel:+254708451517">{FITECH_SHOP.phone}</a>
      <a href={FITECH_SHOP.website}>{FITECH_SHOP.websiteLabel}</a>
    </header>
  );
}

function DocumentFacts({ lines }: { lines: string[] }) {
  return (
    <ul className="sale-check">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

function savePdf(filename: string, lines: string[]) {
  const bytes = buildShopPdf(lines);
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const blob = new Blob([copy], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function PayChoice({
  current,
  value,
  title,
  detail,
  onPick,
}: {
  current: Method | "";
  value: Method;
  title: string;
  detail: string;
  onPick: (value: Method) => void;
}) {
  return (
    <button type="button" className={current === value ? "path on" : "path"} onClick={() => onPick(value)}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </button>
  );
}

function methodLabel(method: Method | ""): string {
  if (method === "cash") return "Cash";
  if (method === "mpesa") return "M-Pesa";
  if (method === "bank") return "Bank transfer";
  if (method === "card") return "Card";
  return "";
}

function whole(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  return Number(trimmed);
}
