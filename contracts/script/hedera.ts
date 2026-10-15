// Shared Hedera testnet setup for the scripts: .env, chain, clients, mirror.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createPublicClient, createWalletClient, defineChain, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const root = resolve(dirname(new URL(import.meta.url).pathname), "../..");

export const env: Record<string, string> = Object.fromEntries(
  readFileSync(resolve(root, ".env"), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);

export const hederaTestnet = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api"] } },
  blockExplorers: { default: { name: "HashScan", url: "https://hashscan.io/testnet" } },
});

export const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1";

export const pub = createPublicClient({ chain: hederaTestnet, transport: http() });

export function signer(role: string) {
  const key = env[`${role}_PRIVATE_KEY`];
  if (!key) throw new Error(`${role}_PRIVATE_KEY missing from .env`);
  const account = privateKeyToAccount(key as Hex);
  return createWalletClient({ account, chain: hederaTestnet, transport: http() });
}

/** The 0.0.x id the mirror node knows an EVM address by, once it has caught up. */
export async function accountId(address: string, kind: "accounts" | "contracts" = "accounts"): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${MIRROR}/${kind}/${address}`);
    if (r.ok) {
      const j = await r.json();
      return kind === "contracts" ? j.contract_id : j.account;
    }
    await new Promise((s) => setTimeout(s, 1500));
  }
  throw new Error(`mirror node never saw ${address}`);
}
