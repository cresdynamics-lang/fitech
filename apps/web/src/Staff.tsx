import { useEffect, useState, type FormEvent } from "react";
import { defaultPermissionKeys, DYNAMIC_PERMISSIONS, roleAccess, type RoleAccess } from "shared";

type StaffDevice = {
  id: string;
  createdAt: string;
  hasPin: boolean;
};

type StaffSession = {
  id: string;
  lastSeenAt: string;
  createdAt: string;
};

type StaffPerson = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastSeen: string | null;
  signIn: string;
  grants: string[];
  devices: StaffDevice[];
  sessions: StaffSession[];
};

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "Branch manager",
  CASHIER: "Cashier",
  INVENTORY: "Inventory lead",
};

function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

function seen(iso: string | null): string {
  if (!iso) {
    return "Not signed in";
  }
  const then = new Date(iso).getTime();
  const gap = Date.now() - then;
  if (gap < 2 * 60 * 1000) {
    return "Now";
  }
  if (gap < 60 * 60 * 1000) {
    return `${Math.max(1, Math.floor(gap / 60000))} min ago`;
  }
  const when = new Date(iso);
  const today = new Date();
  const sameDay = when.toDateString() === today.toDateString();
  const clock = when.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) {
    return `Today ${clock}`;
  }
  return when.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

function accessWord(row: RoleAccess): string {
  if (row.access === "on") {
    return "On";
  }
  if (row.access === "locked") {
    return "Locked";
  }
  if (row.access === "availability") {
    return "Availability only";
  }
  if (row.access === "collect") {
    return "Collect only";
  }
  return row.offNote || "Off";
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "That could not be saved.";
}

export function StaffBoard({
  role,
  onRegisterBack,
}: {
  role: "OWNER" | "MANAGER" | "CASHIER" | "INVENTORY";
  onRegisterBack: (handler: (() => boolean) | null) => void;
}) {
  const owner = role === "OWNER";
  const [mode, setMode] = useState<"people" | "performance">("people");
  const [people, setPeople] = useState<StaffPerson[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState("CASHIER");
  const [grants, setGrants] = useState<string[]>(() => defaultPermissionKeys("CASHIER"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    void fetch("/api/staff")
      .then(async (response) => {
        if (!response.ok) {
          setError(await readError(response));
          return;
        }
        const body = (await response.json()) as { people?: StaffPerson[] };
        setPeople(body.people ?? []);
      })
      .catch(() => setError("Staff could not be loaded."));
  }

  useEffect(load, []);

  useEffect(() => {
    onRegisterBack(() => {
      if (!selectedId) {
        return false;
      }
      setSelectedId(null);
      setError("");
      return true;
    });
    return () => onRegisterBack(null);
  });

  const selected = people.find((person) => person.id === selectedId) ?? null;

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/staff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password, role: newRole, grants }),
    });
    setBusy(false);
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    setName("");
    setEmail("");
    setPassword("");
    setAdding(false);
    load();
  }

  async function toggle(person: StaffPerson, key: string, enabled: boolean) {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/staff/${person.id}/grants`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, enabled }),
    });
    setBusy(false);
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    load();
  }

  async function revoke(person: StaffPerson, deviceId: string) {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/staff/${person.id}/devices/${deviceId}/revoke`, { method: "POST" });
    setBusy(false);
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    load();
  }

  async function revokeAll(person: StaffPerson) {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/staff/${person.id}/devices/revoke-all`, { method: "POST" });
    setBusy(false);
    if (!response.ok) {
      setError(await readError(response));
      return;
    }
    load();
  }

  if (selected) {
    return (
      <PersonDetail
        person={selected}
        owner={owner}
        busy={busy}
        error={error}
        onBack={() => {
          setSelectedId(null);
          setError("");
        }}
        onToggle={(key, enabled) => void toggle(selected, key, enabled)}
        onRevoke={(deviceId) => void revoke(selected, deviceId)}
        onRevokeAll={() => void revokeAll(selected)}
      />
    );
  }

  return (
    <section>
      <h1>Staff</h1>
      <p className="lede">
        {owner
          ? "People, performance, permissions and the devices they sign in on."
          : "People and their sales count. Permissions and devices stay with the owner."}
      </p>
      <div className="sale-links">
        <button type="button" className={mode === "people" ? "sale-next" : ""} onClick={() => setMode("people")}>
          People
        </button>
        <button
          type="button"
          className={mode === "performance" ? "sale-next" : ""}
          onClick={() => setMode("performance")}
        >
          Performance
        </button>
      </div>
      {mode === "people" ? (
        <>
          <div className="variant-groups">
            {people.map((person) => (
              <button key={person.id} type="button" className="variant" onClick={() => setSelectedId(person.id)}>
                <strong>
                  {person.name}
                  <small>
                    {roleLabel(person.role)} · {person.status}
                  </small>
                </strong>
                <span>
                  {seen(person.lastSeen)} · {person.signIn}
                </span>
              </button>
            ))}
          </div>
          {owner ? (
            adding ? (
              <form onSubmit={(event) => void add(event)}>
                <label className="field">
                  Name
                  <input value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label className="field">
                  Email
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                </label>
                <label className="field">
                  Password
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
                </label>
                <label className="field">
                  Role
                  <select
                    value={newRole}
                    onChange={(event) => {
                      setNewRole(event.target.value);
                      setGrants(defaultPermissionKeys(event.target.value));
                    }}
                  >
                    <option value="MANAGER">Branch manager</option>
                    <option value="CASHIER">Cashier</option>
                    <option value="INVENTORY">Inventory lead</option>
                  </select>
                </label>
                <h2>Permissions</h2>
                <p className="empty">Choose what this person can do. Each one can be changed later.</p>
                <div className="variant-groups">
                  {DYNAMIC_PERMISSIONS.map((item) => {
                    const on = grants.includes(item.key);
                    return (
                      <div key={item.key} className="variant">
                        <strong>{item.label}</strong>
                        <button
                          type="button"
                          className={on ? "sale-next" : "sale-back"}
                          aria-pressed={on}
                          onClick={() =>
                            setGrants((current) =>
                              current.includes(item.key)
                                ? current.filter((key) => key !== item.key)
                                : [...current, item.key],
                            )
                          }
                        >
                          {on ? "On" : "Off"}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="hidden-note">
                  Buying price, profit, margins, expenses and Lipa totals stay with the owner. They are not a choice
                  here. No self sign-up. People are not deleted.
                </p>
                <div className="sale-actions">
                  <button type="submit" className="sale-next" disabled={busy}>
                    Add staff
                  </button>
                  <button type="button" className="sale-back" onClick={() => setAdding(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="sale-links">
                <button type="button" onClick={() => setAdding(true)}>
                  Add staff
                </button>
              </div>
            )
          ) : null}
        </>
      ) : (
        <div className="variant-groups">
          {people.map((person) => (
            <button key={person.id} type="button" className="variant" onClick={() => setSelectedId(person.id)}>
              <strong>
                {person.name}
                <small>{roleLabel(person.role)}</small>
              </strong>
              <span>Nothing recorded</span>
            </button>
          ))}
          <p className="hidden-note">
            Sales, value, last month and average sale are nothing recorded. There is no sale history yet.
            {owner ? " Gross profit is for the owner, and it is nothing recorded too." : " Profit is not shown."}
          </p>
        </div>
      )}
      {error ? <p className="sale-block">{error}</p> : null}
    </section>
  );
}

function PersonDetail({
  person,
  owner,
  busy,
  error,
  onBack,
  onToggle,
  onRevoke,
  onRevokeAll,
}: {
  person: StaffPerson;
  owner: boolean;
  busy: boolean;
  error: string;
  onBack: () => void;
  onToggle: (key: string, enabled: boolean) => void;
  onRevoke: (deviceId: string) => void;
  onRevokeAll: () => void;
}) {
  const rows = roleAccess(person.role, person.grants);
  return (
    <section>
      <button type="button" className="sale-back" onClick={onBack}>
        Back
      </button>
      <h1>{person.name}</h1>
      <p className="lede">
        {roleLabel(person.role)} · {person.status} · {person.email}
      </p>
      <p className="empty">
        Last seen {seen(person.lastSeen)}. Sign-in: {person.signIn}.
      </p>
      <h2>Performance</h2>
      <div className="variant">
        <strong>Sales</strong>
        <span>Nothing recorded</span>
      </div>
      <div className="variant">
        <strong>Value</strong>
        <span>Nothing recorded</span>
      </div>
      <div className="variant">
        <strong>Last month</strong>
        <span>Nothing recorded</span>
      </div>
      <div className="variant">
        <strong>Change</strong>
        <span>Nothing recorded</span>
      </div>
      <div className="variant">
        <strong>Average sale</strong>
        <span>Nothing recorded</span>
      </div>
      {owner ? (
        <div className="variant">
          <strong>Gross profit</strong>
          <span>Nothing recorded</span>
        </div>
      ) : (
        <p className="hidden-note">Profit, cost and pay are not shown.</p>
      )}
      <h2>Devices logged in</h2>
      {person.devices.length === 0 && person.sessions.length === 0 ? (
        <p className="empty">No device is signed in.</p>
      ) : null}
      <div className="variant-groups">
        {person.devices.map((device) => (
          <div key={device.id} className="variant">
            <strong>
              Signed-in device
              <small>
                {device.hasPin ? "PIN on" : "No PIN"} · added {seen(device.createdAt)}
              </small>
            </strong>
            {owner ? (
              <button type="button" className="sale-back" disabled={busy} onClick={() => onRevoke(device.id)}>
                Revoke
              </button>
            ) : (
              <span>Known</span>
            )}
          </div>
        ))}
        {person.sessions.map((session) => (
          <div key={session.id} className="variant">
            <strong>
              Open session
              <small>Last seen {seen(session.lastSeenAt)}</small>
            </strong>
            <span>Signed in</span>
          </div>
        ))}
      </div>
      {owner ? (
        <>
          <p className="hidden-note">
            Revoking a device signs the person out of every open session. Their other devices stay known and can sign
            in again.
          </p>
          <div className="sale-links">
            <button type="button" disabled={busy} onClick={onRevokeAll}>
              Revoke all devices for this person
            </button>
          </div>
        </>
      ) : (
        <p className="hidden-note">A branch manager can see devices and cannot revoke them.</p>
      )}
      <h2>Permissions</h2>
      <div className="variant-groups">
        {rows.map((row) => (
          <div key={row.label} className="variant">
            <strong>{row.label}</strong>
            {owner && row.grantKey ? (
              <button
                type="button"
                className={row.access === "on" || row.access === "collect" ? "sale-next" : "sale-back"}
                aria-pressed={row.access === "on" || row.access === "collect"}
                disabled={busy}
                onClick={() => onToggle(row.grantKey as string, row.access !== "on" && row.access !== "collect")}
              >
                {accessWord(row)}
              </button>
            ) : (
              <span>{accessWord(row)}</span>
            )}
          </div>
        ))}
      </div>
      <p className="hidden-note">
        These are chosen when the person is added, and the owner can change them here. Buying price, profit, margins,
        expenses and Lipa totals have no switch. A temporary look at a buying price is 5 minutes to 8 hours, and that
        permission is not named yet. Adding a cost line does not show the figure back.
      </p>
      {error ? <p className="sale-block">{error}</p> : null}
    </section>
  );
}
