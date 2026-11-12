import { useEffect, useRef, useState, type FormEvent } from "react";

export type SignedInUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  grants?: string[];
};

type SignInProps = {
  onSignedIn: (user: SignedInUser) => void;
};

export type RecognisedPerson = {
  name: string;
  email: string;
  hasPasskey: boolean;
  hasPin: boolean;
};

export type UnlockMethod = "face" | "touch" | "biometric" | "password";

export type DeviceSensors = {
  face: boolean;
  touch: boolean;
};

let prepared: Promise<{ recognised: RecognisedPerson | null; sensors: DeviceSensors }> | null = null;
let biometricAttempt: Promise<SignedInUser | null> | null = null;

async function loadRecognised(): Promise<RecognisedPerson | null> {
  const response = await fetch("/api/auth/recognised");
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as { known?: boolean } & Partial<RecognisedPerson>;
  if (!body.known || !body.name || !body.email) {
    return null;
  }
  return {
    name: body.name,
    email: body.email,
    hasPasskey: body.hasPasskey === true,
    hasPin: body.hasPin === true,
  };
}

async function localSensors(): Promise<DeviceSensors> {
  const credential = window.PublicKeyCredential;
  const available = await credential?.isUserVerifyingPlatformAuthenticatorAvailable?.().catch(() => false);
  const caps = ((await credential?.getClientCapabilities?.().catch(() => ({}))) ?? {}) as Record<string, boolean>;
  const platform =
    available === true ||
    caps.passkeyPlatformAuthenticator === true ||
    caps.userVerifyingPlatformAuthenticator === true;
  const agent = navigator.userAgent;
  const mac = /Mac/.test(agent) && !/iPhone|iPad/.test(agent);
  const ios = /iPhone|iPad/.test(agent);
  if (mac) {
    return { face: false, touch: platform };
  }
  if (ios) {
    return { face: platform, touch: false };
  }
  if (!platform) {
    return { face: false, touch: false };
  }
  return { face: true, touch: true };
}

function primaryMethod(sensors: DeviceSensors): UnlockMethod {
  if (sensors.touch) {
    return "touch";
  }
  if (sensors.face) {
    return "face";
  }
  return "password";
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

const KEYS: Array<{ digit: string; letters: string }> = [
  { digit: "1", letters: "" },
  { digit: "2", letters: "ABC" },
  { digit: "3", letters: "DEF" },
  { digit: "4", letters: "GHI" },
  { digit: "5", letters: "JKL" },
  { digit: "6", letters: "MNO" },
  { digit: "7", letters: "PQRS" },
  { digit: "8", letters: "TUV" },
  { digit: "9", letters: "WXYZ" },
];

async function signInWithPasskey(): Promise<SignedInUser | null> {
  try {
    const { startAuthentication } = await import("@simplewebauthn/browser");
    const optionsResponse = await fetch("/api/auth/passkey/options", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userVerification: "required" }),
    });
    if (!optionsResponse.ok) {
      return null;
    }
    const optionsJSON = (await optionsResponse.json()) as { challenge?: string };
    if (!optionsJSON.challenge) {
      return null;
    }
    const credential = await startAuthentication({ optionsJSON: optionsJSON as never });
    const verified = await fetch("/api/auth/passkey/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credential),
    });
    const body = (await verified.json()) as { user?: SignedInUser };
    return verified.ok && body.user ? body.user : null;
  } catch {
    return null;
  }
}

async function enrollWithBiometric(): Promise<SignedInUser | null> {
  try {
    const { startRegistration } = await import("@simplewebauthn/browser");
    const optionsResponse = await fetch("/api/auth/passkey/enroll/options", { method: "POST" });
    if (!optionsResponse.ok) {
      return null;
    }
    const optionsJSON = (await optionsResponse.json()) as { challenge?: string };
    if (!optionsJSON.challenge) {
      return null;
    }
    const credential = await startRegistration({ optionsJSON: optionsJSON as never });
    const verified = await fetch("/api/auth/passkey/enroll/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credential),
    });
    const body = (await verified.json()) as { user?: SignedInUser };
    return verified.ok && body.user ? body.user : null;
  } catch {
    return null;
  }
}

async function enableBiometric(): Promise<void> {
  try {
    const { startRegistration } = await import("@simplewebauthn/browser");
    const optionsResponse = await fetch("/api/auth/passkey/register/options", { method: "POST" });
    if (!optionsResponse.ok) {
      return;
    }
    const optionsJSON = await optionsResponse.json();
    const credential = await startRegistration({ optionsJSON });
    await fetch("/api/auth/passkey/register/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credential),
    });
  } catch {
    // Password sign-in still stands if the biometric prompt is dismissed.
  }
}

function prepareSignIn(): Promise<{ recognised: RecognisedPerson | null; sensors: DeviceSensors }> {
  if (!prepared) {
    let run: Promise<{ recognised: RecognisedPerson | null; sensors: DeviceSensors }>;
    run = Promise.all([loadRecognised(), localSensors()])
      .then(([recognised, sensors]) => ({ recognised, sensors }))
      .finally(() => {
        if (prepared === run) {
          prepared = null;
        }
      });
    prepared = run;
  }
  return prepared;
}

function attemptBiometric(hasPasskey: boolean): Promise<SignedInUser | null> {
  if (!biometricAttempt) {
    let run: Promise<SignedInUser | null>;
    run = (hasPasskey ? signInWithPasskey() : enrollWithBiometric()).finally(() => {
      if (biometricAttempt === run) {
        biometricAttempt = null;
      }
    });
    biometricAttempt = run;
  }
  return biometricAttempt;
}

export function SignIn({ onSignedIn }: SignInProps) {
  const [phase, setPhase] = useState<"checking" | UnlockMethod | "pin" | "setup">("checking");
  const [recognised, setRecognised] = useState<RecognisedPerson | null>(null);
  const [method, setMethod] = useState<UnlockMethod>("password");
  const [sensors, setSensors] = useState<DeviceSensors>({ face: false, touch: false });
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const recognisedRef = useRef(recognised);
  const sensorsRef = useRef(sensors);
  const beginRef = useRef<(next: "face" | "touch") => void>(() => undefined);
  recognisedRef.current = recognised;
  sensorsRef.current = sensors;

  function settle(id: number, user: SignedInUser | null) {
    if (user) {
      onSignedIn(user);
      return;
    }
    if (id !== generation.current) {
      return;
    }
    setNotice("Use PIN");
    setPhase("pin");
  }

  useEffect(() => {
    let cancelled = false;
    const id = ++generation.current;
    void (async () => {
      const result = await prepareSignIn();
      if (cancelled || id !== generation.current) {
        return;
      }
      setRecognised(result.recognised);
      setSensors(result.sensors);
      const next = primaryMethod(result.sensors);
      setMethod(next);
      if (!result.recognised) {
        setPhase("setup");
        return;
      }
      if (next === "password") {
        setPhase("pin");
        return;
      }
      setPhase(next);
      const user = await withTimeout(attemptBiometric(result.recognised.hasPasskey), 60_000);
      if (cancelled) {
        return;
      }
      settle(id, user);
    })();
    return () => {
      cancelled = true;
    };
  }, [onSignedIn]);

  function begin(next: "face" | "touch") {
    if (!recognised) {
      setNotice("Use PIN");
      setPhase("pin");
      return;
    }
    const id = ++generation.current;
    biometricAttempt = null;
    setMethod(next);
    setNotice("");
    setPhase(next);
    void withTimeout(recognised.hasPasskey ? signInWithPasskey() : enrollWithBiometric(), 60_000).then((user) => {
      settle(id, user);
    });
  }

  function usePin() {
    generation.current += 1;
    setNotice("Use PIN");
    setPhase("pin");
  }

  beginRef.current = begin;

  useEffect(() => {
    let away = false;
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        away = true;
        return;
      }
      if (!away) {
        return;
      }
      away = false;
      const senses = sensorsRef.current;
      const next = senses.touch ? "touch" : senses.face ? "face" : null;
      if (!next || !recognisedRef.current) {
        return;
      }
      beginRef.current(next);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  if (phase === "checking") {
    return (
      <main className="lock-screen">
        <div className="lock-frame">
          <div className="lock-copy">
            <p className="lock-hint">Checking this device</p>
          </div>
        </div>
      </main>
    );
  }
  if (phase === "face" || phase === "touch" || phase === "biometric") {
    return (
      <BiometricPrompt name={recognised?.name ?? ""} method={phase} onUsePin={usePin} />
    );
  }
  if (!recognised || phase === "setup") {
    return <DeviceSetup onSignedIn={onSignedIn} method={method} />;
  }
  return (
    <PinPad
      name={recognised.name}
      mode={recognised.hasPin ? "enter" : "choose"}
      method={method}
      again={method === "touch" ? "Unlock" : ""}
      notice={notice}
      onRetry={() => {
        if (method === "face" || method === "touch") {
          begin(method);
        }
      }}
      onUnlocked={onSignedIn}
    />
  );
}

function BiometricPrompt({
  name,
  method,
  onUsePin,
}: {
  name: string;
  method: Exclude<UnlockMethod, "password">;
  onUsePin: () => void;
}) {
  return (
    <main className="lock-screen">
      <div className="lock-frame">
        <div className="bio-body">
          <p className="lock-kicker">Welcome back</p>
          <h1>{name || "Fitech"}</h1>
          {method === "touch" ? <FingerScan /> : method === "face" ? <FaceScan /> : <SensorCheck />}
        </div>
        <div className="bio-actions">
          <button type="button" className="pin-side" onClick={onUsePin}>
            Use PIN
          </button>
        </div>
      </div>
    </main>
  );
}

export async function deviceNeedsPin(): Promise<boolean> {
  const [recognised, sensors] = await Promise.all([loadRecognised(), localSensors()]);
  return primaryMethod(sensors) === "password" && recognised !== null && !recognised.hasPin;
}

export function PinPad({
  name,
  mode,
  method = "password",
  again,
  notice = "",
  onRetry,
  onUnlocked,
}: {
  name: string;
  mode: "enter" | "choose";
  method?: UnlockMethod;
  again: string;
  notice?: string;
  onRetry: () => void;
  onUnlocked: (user: SignedInUser) => void;
}) {
  const [step, setStep] = useState<"first" | "confirm">(mode === "choose" ? "first" : "confirm");
  const [first, setFirst] = useState("");
  const [digits, setDigits] = useState("");
  const [error, setError] = useState("");
  const [banner, setBanner] = useState(notice);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  const hint =
    mode === "enter" ? "Enter Passcode" : step === "first" ? "Set a Passcode" : "Re-enter Passcode";

  async function submit(pin: string) {
    if (mode === "choose" && step === "first") {
      setFirst(pin);
      setDigits("");
      setStep("confirm");
      return;
    }
    if (mode === "choose" && pin !== first) {
      setError("Those PINs do not match.");
      setShake(true);
      setFirst("");
      setDigits("");
      setStep("first");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(mode === "choose" ? "/api/auth/pin/setup" : "/api/auth/pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const body = (await response.json()) as { user?: SignedInUser; error?: string };
      if (!response.ok || !body.user) {
        setError(body.error ?? "Wrong PIN.");
        setShake(true);
        setDigits("");
        return;
      }
      onUnlocked(body.user);
    } finally {
      setBusy(false);
    }
  }

  function press(key: string) {
    if (busy) {
      return;
    }
    setError("");
    setBanner("");
    if (key === "delete") {
      setDigits((current) => current.slice(0, -1));
      return;
    }
    if (digits.length >= 6) {
      return;
    }
    const next = digits + key;
    setDigits(next);
    if (next.length === 6) {
      void submit(next);
    }
  }

  return (
    <main className="lock-screen">
      <div className="lock-frame pin-frame">
        <div className="lock-copy">
          <p className="lock-kicker">Welcome back</p>
          <h1>{name}</h1>
          <p className="lock-hint">{banner && !error ? banner : hint}</p>
          <div
            className={shake ? "pin-dots shake" : "pin-dots"}
            aria-label={`${digits.length} of 6`}
            onAnimationEnd={() => setShake(false)}
          >
            {Array.from({ length: 6 }, (_, index) => (
              <span key={index} className={index < digits.length ? "filled" : ""} />
            ))}
          </div>
          <p className="pin-error" role="status">
            {error}
          </p>
        </div>
        <div className="pin-keys" role="group" aria-label="Passcode">
          {KEYS.map((key) => (
            <button
              key={key.digit}
              type="button"
              className={key.letters ? "glass-key" : "glass-key solo"}
              disabled={busy}
              onClick={() => press(key.digit)}
            >
              <span className="digit">{key.digit}</span>
              {key.letters ? <span className={key.letters.length > 3 ? "letters wide" : "letters"}>{key.letters}</span> : null}
            </button>
          ))}
          <span className="pin-side-slot">
            {again ? (
              <button type="button" className="pin-side" onClick={onRetry} aria-label={again}>
                {method === "touch" ? <FingerMark /> : <FaceMark />}
              </button>
            ) : null}
          </span>
          <button type="button" className="glass-key solo" disabled={busy} onClick={() => press("0")}>
            <span className="digit">0</span>
          </button>
          <button type="button" className="pin-side" disabled={busy || digits.length === 0} onClick={() => press("delete")}>
            Delete
          </button>
        </div>
      </div>
    </main>
  );
}

function DeviceSetup({
  onSignedIn,
  method,
}: {
  onSignedIn: (user: SignedInUser) => void;
  method: UnlockMethod;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function start(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json()) as { needsCode?: boolean; devCode?: string; error?: string };
      if (!response.ok) {
        setError(body.error ?? "That email is not set up.");
        return;
      }
      setNeedsCode(true);
      setDevCode(body.devCode ?? "");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const body = (await response.json()) as { user?: SignedInUser; error?: string };
      if (!response.ok || !body.user) {
        setError(body.error ?? "That code is wrong.");
        return;
      }
      if (method !== "password") {
        await enableBiometric();
      }
      onSignedIn(body.user);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="lock-screen">
      <div className="lock-frame device-setup">
      <img className="logo" src="/logo.png" alt="Fitech" />
      <form onSubmit={needsCode ? confirm : start}>
        <h1>Set up this device</h1>
        <p>Enter the email for this account. After that, this device uses biometrics or a 6-digit PIN.</p>
        <input
          type="email"
          autoComplete="username"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          readOnly={needsCode}
        />
        {needsCode ? (
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            pattern="\d{6}"
            required
          />
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
        {devCode ? <p className="dev-code">Development only. Code {devCode}</p> : null}
        <button type="submit" className="primary" disabled={busy}>
          {needsCode ? "Confirm code" : "Continue"}
        </button>
      </form>
      </div>
    </main>
  );
}

function FaceScan() {
  return (
    <div className="face-stage" aria-hidden="true">
      <span className="scan-beam" />
      <FaceMark />
    </div>
  );
}

function SensorCheck() {
  return (
    <div className="finger-stage" aria-hidden="true">
      <span className="touch-ring" />
      <span className="finger-disc sensor-pair">
        <FaceMark />
        <FingerMark />
      </span>
    </div>
  );
}

function FingerScan() {
  return (
    <div className="finger-stage" aria-hidden="true">
      <span className="touch-ring" />
      <span className="touch-ring late" />
      <span className="finger-disc">
        <FingerMark />
      </span>
    </div>
  );
}

function FaceMark() {
  return (
    <svg className="face-mark" viewBox="0 0 120 120" aria-hidden="true">
      <path d="M36 18H22a10 10 0 0 0-10 10v14" />
      <path d="M84 18h14a10 10 0 0 1 10 10v14" />
      <path d="M108 78v14a10 10 0 0 1-10 10H84" />
      <path d="M12 78v14a10 10 0 0 0 10 10h14" />
      <path d="M46 48v10" />
      <path d="M74 48v10" />
      <path d="M60 54v14c0 4-2.2 6-4.6 7.2" />
      <path d="M44 82c4.4 6 9.2 9 16 9s11.6-3 16-9" />
    </svg>
  );
}

function FingerMark() {
  return (
    <svg className="finger-mark" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 8c9.4 0 17 7.2 17 17.4V36" />
      <path d="M18.5 27C19.4 18.2 25.2 12 32 12c3.4 0 6.5 1.2 8.9 3.2" />
      <path d="M14 33.5c.2-5.2 1.4-10.6 4.6-14.6" />
      <path d="M23 40.5V29.2c0-5 4-9 9-9s9 4 9 9V37" />
      <path d="M27.2 44.2V31.2c0-2.6 2.1-4.8 4.8-4.8s4.8 2.2 4.8 4.8v9.4c0 3.4-.7 6-1.8 8.2" />
      <path d="M32 32.2v9.6c0 5.2-1.2 9-3.4 12.4" />
      <path d="M21.5 46.5c1.8 4.6 5.4 8.4 11 10.4" />
      <path d="M46 38.2c.6 5.4-.2 10.6-2.6 15" />
      <path d="M38.6 50.8c1 2.2 1.4 4.2 1.1 6.6" />
    </svg>
  );
}

