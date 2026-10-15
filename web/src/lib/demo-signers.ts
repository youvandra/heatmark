// Dev-only: the demo role keys, read from VITE_DEMO_KEYS in web/.env.local
// (git-ignored). Imported only behind import.meta.env.DEV, so a production
// build contains neither this module nor the keys.
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hedera, type Signer } from "./wallet";

const LABELS: Record<string, string> = {
  ACCREDITOR: "Accreditor (demo)",
  VERIFIER: "Verifier (demo)",
  MELT_SHOP: "Aegean Melt Shop — operator",
  ROLLING_MILL: "Aegean Rolling Mill — operator",
  IMPORTER: "Importer (demo)",
};

export function loadDemoSigners(): Signer[] {
  const raw = import.meta.env.VITE_DEMO_KEYS as string | undefined;
  if (!raw) return [];
  const keys = JSON.parse(raw) as Record<string, Hex>;
  return Object.entries(keys).map(([role, key]) => {
    const account = privateKeyToAccount(key);
    return {
      address: account.address,
      label: LABELS[role] ?? role,
      kind: "demo" as const,
      wallet: createWalletClient({ account, chain: hedera, transport: http() }),
    };
  });
}
