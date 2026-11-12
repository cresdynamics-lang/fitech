import { useEffect, useState } from "react";
import { deviceNeedsPin, PinPad, SignIn, type SignedInUser } from "./SignIn";

export function App() {
  const [user, setUser] = useState<SignedInUser | null | undefined>(undefined);
  const [pinNeeded, setPinNeeded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        const body = (await response.json()) as { user: SignedInUser };
        return body.user;
      })
      .then(async (next) => {
        if (cancelled) {
          return;
        }
        if (next && (await deviceNeedsPin())) {
          setPinNeeded(true);
        }
        if (!cancelled) {
          setUser(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (user === undefined) {
    return <main className="booting" />;
  }
  if (!user) {
    return <SignIn onSignedIn={setUser} />;
  }
  if (pinNeeded) {
    return (
      <PinPad
        name={user.name}
        mode="choose"
        again=""
        onRetry={() => undefined}
        onUnlocked={() => setPinNeeded(false)}
      />
    );
  }
  return <SignedIn user={user} onSignedOut={() => setUser(null)} />;
}

function SignedIn({ user, onSignedOut }: { user: SignedInUser; onSignedOut: () => void }) {
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

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    onSignedOut();
  }

  async function turnOnFaceId() {
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

  return (
    <main className="signed-in">
      <h1>Welcome back, {user.name}</h1>
      <p>{user.role}</p>
      <p className="fine">You are signed in.</p>
      {canUseBiometric ? (
        <button type="button" className="outline" onClick={() => void turnOnFaceId()}>
          Turn on biometrics for this device
        </button>
      ) : null}
      <button type="button" className="primary" onClick={() => void signOut()}>
        Sign out
      </button>
      {message ? <p className="fine">{message}</p> : null}
    </main>
  );
}
