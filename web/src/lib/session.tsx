import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { connectInjected, demoSigners, type Signer } from "./wallet";

interface Session {
  signer: Signer | null;
  demo: Signer[];
  choose: (address: string) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  notify: (message: string, error?: boolean) => void;
}

const Ctx = createContext<Session | null>(null);
const STORE = "heatmark.signer";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [signer, setSigner] = useState<Signer | null>(null);
  const [demo, setDemo] = useState<Signer[]>([]);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);

  useEffect(() => {
    demoSigners().then((list) => {
      setDemo(list);
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(STORE);
      } catch {
        // storage unavailable
      }
      const found = list.find((s) => s.address === saved);
      if (found) setSigner(found);
    });
  }, []);

  const notify = useCallback((message: string, error = false) => {
    setToast({ message, error });
    window.setTimeout(() => setToast((t) => (t?.message === message ? null : t)), error ? 9000 : 4500);
  }, []);

  const choose = useCallback(
    (address: string) => {
      const s = demo.find((d) => d.address === address) ?? null;
      setSigner(s);
      try {
        if (s) localStorage.setItem(STORE, s.address);
      } catch {
        // storage unavailable
      }
    },
    [demo],
  );

  const connect = useCallback(async () => {
    try {
      setSigner(await connectInjected());
    } catch (e) {
      notify((e as Error).message, true);
    }
  }, [notify]);

  const value = useMemo(
    () => ({ signer, demo, choose, connect, disconnect: () => setSigner(null), notify }),
    [signer, demo, choose, connect, notify],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {toast && <div className={`toast${toast.error ? " err" : ""}`} role="status">{toast.message}</div>}
    </Ctx.Provider>
  );
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}

/** Loads data and keeps a reload handle; errors land in the toast. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; reload: () => void; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    fn()
      .then((d) => live && (setData(d), setError(null)))
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, reload: () => setTick((t) => t + 1), error };
}
