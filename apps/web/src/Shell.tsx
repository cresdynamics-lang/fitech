import { useEffect, useRef, useState } from "react";
import { roleAccess } from "shared";
import { DevicesBoard } from "./Devices";
import { MoneyBoard } from "./Money";
import { NewSale } from "./NewSale";
import { PartnersBoard } from "./Partners";
import { PerformanceBoard, StaffBoard } from "./Staff";
import { StockBoard, type StockUnit } from "./StockPick";
import type { SignedInUser } from "./SignIn";

type Role = "OWNER" | "MANAGER" | "CASHIER" | "INVENTORY";

type NavItem = {
  id: string;
  label: string;
  mark: string;
};

const NAV: NavItem[] = [
  { id: "today", label: "Today", mark: "To" },
  { id: "sales", label: "Sales (POS)", mark: "Sa" },
  { id: "deliveries", label: "Deliveries", mark: "De" },
  { id: "inventory", label: "Inventory", mark: "In" },
  { id: "devices", label: "Devices", mark: "Dv" },
  { id: "repairs", label: "Repairs", mark: "Re" },
  { id: "partners", label: "Partners", mark: "Pa" },
  { id: "customers", label: "Customers", mark: "Cu" },
  { id: "lipa", label: "Lipa", mark: "Li" },
  { id: "money", label: "Money", mark: "Mo" },
  { id: "performance", label: "Performance", mark: "Pe" },
  { id: "assistant", label: "AI Assistant", mark: "AI" },
  { id: "staff", label: "Staff & devices", mark: "St" },
  { id: "activity", label: "Activity", mark: "Ac" },
  { id: "settings", label: "Settings", mark: "Se" },
];

const SIDE: Record<Role, string[]> = {
  OWNER: NAV.map((item) => item.id),
  MANAGER: ["today", "sales", "deliveries", "inventory", "devices", "repairs", "partners", "customers", "lipa", "performance", "staff", "assistant"],
  CASHIER: ["today", "sales", "deliveries", "repairs", "customers", "lipa", "performance", "assistant"],
  INVENTORY: ["today", "inventory", "devices", "repairs", "assistant"],
};

const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  MANAGER: "Branch manager",
  CASHIER: "Cashier",
  INVENTORY: "Inventory lead",
};

function asRole(role: string): Role {
  if (role === "MANAGER" || role === "CASHIER" || role === "INVENTORY" || role === "OWNER") {
    return role;
  }
  return "CASHIER";
}

function item(id: string): NavItem {
  return NAV.find((entry) => entry.id === id) ?? { id, label: id, mark: id.slice(0, 2) };
}

function sectionAllowed(id: string, role: Role, grants: readonly string[]): boolean {
  const rows = roleAccess(role, grants);
  const on = (label: string) => {
    const row = rows.find((entry) => entry.label === label);
    return row?.access === "on" || row?.access === "collect";
  };
  if (id === "sales") {
    return on("Record a sale and its payment path");
  }
  if (id === "deliveries") {
    return on("Hand phones to riders, close deliveries");
  }
  if (id === "partners") {
    return on("Give or borrow phones with dealers");
  }
  if (id === "lipa") {
    return on("Collect Lipa");
  }
  if (id === "repairs" && role === "INVENTORY") {
    return on("Update repair jobs and reminders");
  }
  return true;
}

function shopDate(now: Date): string {
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][now.getDay()];
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][now.getMonth()];
  return `${weekday} ${now.getDate()} ${month}`;
}

function greeting(name: string, now: Date): string {
  const hour = now.getHours();
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${part}, ${name}`;
}

export function Shell({ user, onSignedOut }: { user: SignedInUser; onSignedOut: () => void }) {
  const role = asRole(user.role);
  const now = new Date();
  const grants = user.grants ?? [];
  const side = SIDE[role].map(item).filter((entry) => sectionAllowed(entry.id, role, grants));
  const [section, setSection] = useState("today");
  const [trail, setTrail] = useState<string[]>([]);
  const [sidebar, setSidebar] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  const [drawer, setDrawer] = useState(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  const [profileOpen, setProfileOpen] = useState(false);
  const [held, setHeld] = useState<StockUnit | null>(null);
  const saleBack = useRef<(() => boolean) | null>(null);
  const [message, setMessage] = useState("");
  const [canUseBiometric, setCanUseBiometric] = useState(false);

  useEffect(() => {
    const credential = window.PublicKeyCredential;
    if (!credential?.isUserVerifyingPlatformAuthenticatorAvailable) {
      return;
    }
    void credential
      .isUserVerifyingPlatformAuthenticatorAvailable()
      .then(setCanUseBiometric)
      .catch(() => setCanUseBiometric(false));
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const apply = () => setNarrow(media.matches);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  function open(id: string) {
    setProfileOpen(false);
    setDrawer(false);
    if (id === "sales") {
      setHeld(null);
    }
    if (id === section) {
      return;
    }
    setTrail((stack) => [...stack, section]);
    setSection(id);
  }

  function sellFromStock(unit: StockUnit) {
    setHeld(unit);
    setProfileOpen(false);
    setDrawer(false);
    if (section !== "sales") {
      setTrail((stack) => [...stack, section]);
      setSection("sales");
    }
  }

  function registerSaleBack(handler: (() => boolean) | null) {
    saleBack.current = handler;
  }

  function back() {
    if (profileOpen) {
      setProfileOpen(false);
      return;
    }
    if (saleBack.current?.()) {
      return;
    }
    setTrail((stack) => {
      const previous = stack.at(-1);
      if (previous) {
        setSection(previous);
        return stack.slice(0, -1);
      }
      if (section !== "today") {
        setSection("today");
      }
      return stack;
    });
  }

  function toggleMenu() {
    setProfileOpen(false);
    if (narrow) {
      setDrawer((openDrawer) => !openDrawer);
      return;
    }
    setSidebar((openSidebar) => !openSidebar);
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    onSignedOut();
  }

  async function turnOnBiometrics() {
    setMessage("");
    const { startRegistration } = await import("@simplewebauthn/browser");
    const optionsResponse = await fetch("/api/auth/passkey/register/options", { method: "POST" });
    if (!optionsResponse.ok) {
      setMessage("Biometrics could not start.");
      return;
    }
    try {
      const optionsJSON = await optionsResponse.json();
      const credential = await startRegistration({ optionsJSON });
      const verified = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(credential),
      });
      setMessage(verified.ok ? "Biometrics are on for this device." : "Biometrics were not saved.");
    } catch {
      setMessage("Biometrics were cancelled.");
    }
  }

  const canBack = profileOpen || section !== "today" || trail.length > 0;
  const shellClass = ["app-shell", sidebar ? "sidebar-on" : "", drawer ? "drawer-open" : ""].filter(Boolean).join(" ");

  return (
    <div className={shellClass}>
      <button type="button" className="menu-backdrop" aria-label="Close menu" onClick={() => setDrawer(false)} />
      <aside className="side">
        <div className="side-brand">
          <strong>Fitech · Nairobi</strong>
          <span>Nairobi, Kenya</span>
        </div>
        <nav className="side-nav" aria-label="Sections">
          {side.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={section === entry.id ? "nav-item active" : "nav-item"}
              data-mark={entry.mark}
              aria-current={section === entry.id ? "page" : undefined}
              onClick={() => open(entry.id)}
            >
              <span className="nav-label">{entry.label}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <span>Secured on this device</span>
          {canUseBiometric ? (
            <button type="button" onClick={() => void turnOnBiometrics()}>
              Turn on biometrics for this device
            </button>
          ) : null}
          <button type="button" onClick={() => void signOut()}>
            Sign out
          </button>
          {message ? <p>{message}</p> : null}
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            type="button"
            className="menu-button"
            aria-label="Menu"
            aria-expanded={narrow ? drawer : sidebar}
            onClick={toggleMenu}
          >
            <span />
            <span />
            <span />
          </button>
          <button type="button" className="brand-link" aria-label="Fitech" onClick={() => open("today")}>
            <img className="brand-logo" src="/logo.png" alt="Fitech" />
          </button>
          {canBack ? (
            <button type="button" className="nav-back" onClick={back}>
              Back
            </button>
          ) : null}
          <div className="nav-tools">
            <div className="top-meta">
            <span>
              {shopDate(now)} · Fitech, Nairobi
            </span>
            <span>
              {user.name} · {ROLE_LABEL[role]}
            </span>
          </div>
          <button
            type="button"
            className={section === "alerts" ? "nav-icon active" : "nav-icon"}
            aria-label="Notifications"
            onClick={() => open("alerts")}
          >
            <BellMark />
          </button>
          <button
            type="button"
            className={profileOpen ? "nav-icon active" : "nav-icon"}
            aria-label="Profile"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((openProfile) => !openProfile)}
          >
            <ProfileMark letter={user.name.trim().charAt(0).toUpperCase() || "F"} />
          </button>
          {profileOpen ? (
            <div className="profile-pop">
              <strong>{user.name}</strong>
              <span>{ROLE_LABEL[role]}</span>
              {side.some((entry) => entry.id === "settings") ? (
                <button type="button" onClick={() => open("settings")}>
                  Settings
                </button>
              ) : null}
              <button type="button" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          ) : null}
          </div>
        </header>
        <main className="canvas">
          <Screen
            role={role}
            section={section}
            name={user.name}
            now={now}
            onOpen={open}
            onBack={back}
            onRegisterBack={registerSaleBack}
            held={held}
            grants={grants}
            onSell={sectionAllowed("sales", role, grants) && role !== "INVENTORY" ? sellFromStock : undefined}
          />
        </main>
      </div>
    </div>
  );
}

function Screen({
  role,
  section,
  name,
  now,
  onOpen,
  onBack,
  onRegisterBack,
  held,
  grants,
  onSell,
}: {
  role: Role;
  section: string;
  name: string;
  now: Date;
  onOpen: (id: string) => void;
  onBack: () => void;
  onRegisterBack: (handler: (() => boolean) | null) => void;
  held: StockUnit | null;
  grants: readonly string[];
  onSell?: (unit: StockUnit) => void;
}) {
  if (section === "today") {
    return <Today role={role} name={name} now={now} onOpen={onOpen} />;
  }
  if (section === "alerts") {
    return (
      <section>
        <h1>Alerts</h1>
        <p className="empty">No alerts yet.</p>
      </section>
    );
  }
  if (section === "sales") {
    return (
      <NewSale
        key={held?.id ?? "new-sale"}
        sellerName={name}
        roleLabel={ROLE_LABEL[role]}
        owner={role === "OWNER"}
        canAddPartner={sectionAllowed("partners", role, grants)}
        onBack={onBack}
        onRegisterBack={onRegisterBack}
        initialUnit={held}
      />
    );
  }
  if (section === "inventory") {
    return <StockBoard onSell={onSell} />;
  }
  if (section === "partners") {
    return <PartnersBoard canAdd={sectionAllowed("partners", role, grants)} />;
  }
  if (section === "money") {
    return <MoneyBoard />;
  }
  if (section === "devices") {
    return <DevicesBoard owner={role === "OWNER"} onRegisterBack={onRegisterBack} />;
  }
  if (section === "performance") {
    return <PerformanceBoard role={role} name={name} />;
  }
  if (section === "staff") {
    return <StaffBoard role={role} onRegisterBack={onRegisterBack} />;
  }
  if (section === "scan") {
    return (
      <section>
        <h1>Scan</h1>
        <p className="lede">Point at the IMEI, serial or box code.</p>
        <p className="empty">The scanner is not connected on this screen yet.</p>
      </section>
    );
  }
  return <Place section={section} role={role} />;
}

function Today({
  role,
  name,
  now,
  onOpen,
}: {
  role: Role;
  name: string;
  now: Date;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="today">
      <header className="today-head">
        <div>
          <h1>{greeting(name, now)}</h1>
          <p>{ROLE_LABEL[role]} · Nothing needs you right now.</p>
        </div>
      </header>
      {role === "OWNER" ? <OwnerToday /> : null}
      {role === "MANAGER" ? <ManagerToday /> : null}
      {role === "CASHIER" ? <CashierToday onOpen={onOpen} /> : null}
      {role === "INVENTORY" ? <InventoryToday onOpen={onOpen} /> : null}
    </section>
  );
}

function OwnerToday() {
  const tiles = ["Money received today", "Sales today", "Profit today", "Lipa overdue"];
  return (
    <>
      <div className="tiles">
        {tiles.map((label) => (
          <article key={label} className="tile">
            <h2>{label}</h2>
            <p>Nothing recorded</p>
          </article>
        ))}
      </div>
      <h2 className="block-title">Needs your attention</h2>
      <p className="empty">Nothing needs a decision yet.</p>
    </>
  );
}

function ManagerToday() {
  const rows = ["Lipa to call", "Reschedule requests", "Low stock", "Staff off shift"];
  return (
    <>
      <ul className="attention">
        {rows.map((label) => (
          <li key={label}>
            <strong>{label}</strong>
            <span>Nothing recorded</span>
          </li>
        ))}
      </ul>
      <p className="hidden-note">Profit, buying prices, finance and Lipa totals are not shown to you.</p>
    </>
  );
}

function CashierToday({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <>
      <button type="button" className="sale-start" onClick={() => onOpen("sales")}>
        New sale
      </button>
      <h2 className="block-title">For you</h2>
      <p className="empty">Nothing is waiting.</p>
      <p className="hidden-note">Profit, costs and shop totals are not shown to you.</p>
    </>
  );
}

function InventoryToday({ onOpen }: { onOpen: (id: string) => void }) {
  const rows = ["Re-order", "Arrivals to scan", "Trade-in phones", "Count variances"];
  return (
    <>
      <ul className="attention">
        {rows.map((label) => (
          <li key={label}>
            <strong>{label}</strong>
            <span>Nothing recorded</span>
          </li>
        ))}
      </ul>
      <button type="button" className="sale-start" onClick={() => onOpen("scan")}>
        Scan
      </button>
      <p className="hidden-note">Selling totals, profit, buying prices and clients are not shown to you.</p>
    </>
  );
}

function Place({ section, role }: { section: string; role: Role }) {
  const titles: Record<string, string> = {
    sales: "New sale",
    deliveries: "Deliveries",
    inventory: "Inventory",
    devices: "Devices",
    repairs: "Repairs",
    partners: "Partners",
    customers: "Customers",
    lipa: "Lipa",
    finance: "Finance",
    expenses: "Expenses",
    performance: "Performance",
    assistant: "AI Assistant",
    staff: "Staff & devices",
    activity: "Activity",
    settings: "Settings",
  };
  const copy: Record<string, string> = {
    sales: "Phone, client, then the payment path. The app records the payment. It does not collect it.",
    deliveries: "Who has the phone, and who has the cash.",
    inventory: "What is in stock, across the categories already in the shop.",
    devices: "Each phone keeps its own record.",
    repairs: "A repair is a tracked job with a due date.",
    partners: "Dealers take phones to sell, or lend a phone the client wants.",
    customers: "Every buyer has an account, a history and a warranty.",
    lipa: role === "OWNER" ? "Who owes what, and who to call first." : "Who to call. Totals are not shown.",
    finance: "This page is for the owner.",
    expenses: "Rent, power, salaries, delivery and marketing. Owner only.",
    performance: "Sales and profit for each person. Profit is for the owner.",
    assistant: "Ask within what this role is allowed to see.",
    staff: "Staff, permissions and devices. Owner only.",
    activity: "What happened, to whom, and who asked.",
    settings: "Account, profile, permissions and preferences.",
  };
  return (
    <section>
      <h1>{titles[section] ?? section}</h1>
      <p className="lede">{copy[section] ?? ""}</p>
      <p className="empty">Nothing recorded yet.</p>
    </section>
  );
}

function BellMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 16.5h12l-1.2-2.1V10a4.8 4.8 0 0 0-9.6 0v4.4L6 16.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 18.2a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ProfileMark({ letter }: { letter: string }) {
  return <span className="profile-letter">{letter}</span>;
}
