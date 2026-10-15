import {
  createPublicClient,
  BaseError,
  createWalletClient,
  custom,
  decodeErrorResult,
  decodeEventLog,
  defineChain,
  encodeFunctionData,
  http,
  type Abi,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import accreditationAbi from "../../../deployments/abi/Accreditation.json";
import attestationsAbi from "../../../deployments/abi/Attestations.json";
import passportsAbi from "../../../deployments/abi/Passports.json";
import deployment from "../../../deployments/hedera-testnet.json";

export const ABI = {
  Accreditation: accreditationAbi as Abi,
  Attestations: attestationsAbi as Abi,
  Passports: passportsAbi as Abi,
};
export type ContractName = keyof typeof ABI;
export const CONTRACTS = deployment.contracts as Record<ContractName, { address: Address; id: string }>;

export const hedera = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.hashio.io/api"] } },
  blockExplorers: { default: { name: "HashScan", url: "https://hashscan.io/testnet" } },
});

export const publicClient = createPublicClient({ chain: hedera, transport: http() });

export interface Signer {
  address: Address;
  label: string;
  kind: "injected" | "demo";
  wallet: WalletClient;
}

/** A browser wallet (MetaMask, HashPack's EVM mode, ...), switched to Hedera testnet. */
export async function connectInjected(): Promise<Signer> {
  const eth = (window as unknown as { ethereum?: { request(a: unknown): Promise<unknown> } }).ethereum;
  if (!eth) throw new Error("No browser wallet found. Install MetaMask or open the demo locally.");
  const wallet = createWalletClient({ chain: hedera, transport: custom(eth) });
  const [address] = await wallet.requestAddresses();
  try {
    await wallet.switchChain({ id: hedera.id });
  } catch {
    await wallet.addChain({ chain: hedera });
  }
  return { address, label: "Browser wallet", kind: "injected", wallet };
}

/**
 * Demo signers exist only in a local dev build: the role keys are read from
 * VITE_DEMO_KEYS, which a production build never includes.
 */
export async function demoSigners(): Promise<Signer[]> {
  if (!import.meta.env.DEV) return [];
  const { loadDemoSigners } = await import("./demo-signers");
  return loadDemoSigners();
}

export async function send(signer: Signer, contract: ContractName, functionName: string, args: unknown[]): Promise<Hex> {
  const to = CONTRACTS[contract].address;
  const data = encodeFunctionData({ abi: ABI[contract], functionName, args });
  // Simulate first: Hashio's gas estimate drops the revert data, eth_call keeps
  // it, so a refusal comes back as the contract's own error name.
  try {
    await publicClient.call({ account: signer.address, to, data });
  } catch (e) {
    const raw = e instanceof BaseError ? (e.walk((x) => typeof (x as { data?: unknown }).data === "string") as { data?: Hex } | null)?.data : undefined;
    if (raw && raw.length >= 10) {
      try {
        const { errorName } = decodeErrorResult({ abi: ABI[contract], data: raw });
        throw new Error(errorName);
      } catch (inner) {
        if (inner instanceof Error && /^[A-Z]\w+$/.test(inner.message)) throw inner;
      }
    }
    throw e;
  }
  // Hedera bills at least 80% of the gas limit, so size it from an estimate.
  const estimate = await publicClient.estimateGas({ account: signer.address, to, data });
  return signer.wallet.sendTransaction({
    // A local (demo) account signs in the page; a browser wallet signs in the extension.
    account: signer.wallet.account ?? signer.address,
    chain: hedera,
    to,
    data,
    gas: (estimate * 12n) / 10n,
  });
}

export async function waitFor(hash: Hex) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
  return receipt;
}

export function eventIn(receipt: Awaited<ReturnType<typeof waitFor>>, contract: ContractName, eventName: string) {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== CONTRACTS[contract].address.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: ABI[contract], data: log.data, topics: log.topics });
      if (ev.eventName === eventName) return ev.args as unknown as Record<string, unknown>;
    } catch {
      // other event
    }
  }
  return null;
}

/** Turns a revert into the contract's own error name, which the UI explains. */
export function revertName(err: unknown): string {
  const text = String((err as { shortMessage?: string; message?: string })?.shortMessage ?? (err as Error)?.message ?? err);
  const m = text.match(/(OverCap|PrecursorOverdrawn|NotHeldByInstallation|PrecursorRevoked|AttestationRevoked|NotOperator|TooDeep|AlreadyAttested|NotActiveVerifier|InvalidAttestation|NotHolder|AlreadyDeclared|ZeroMass)/);
  return m ? m[1] : text.split("\n")[0];
}

export const signMessage = (signer: Signer, message: string) =>
  signer.wallet.signMessage({ account: signer.wallet.account ?? signer.address, message });
