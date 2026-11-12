import { useEffect, useState } from "react";
import { Shell } from "./Shell";
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
  return <Shell user={user} onSignedOut={() => setUser(null)} />;
}
