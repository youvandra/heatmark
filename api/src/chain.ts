import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  decodeEventLog,
  defineChain,
  http,
  keccak256,
  toBytes,
  type Abi,
  type Address,
  type Hex,
} from "viem";

const root = resolve(import.meta.dir, "../..");
const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));

export const deployment = read("deployments/hedera-testnet.json") as {
  contracts: Record<"Accreditation" | "Attestations" | "Passports", { address: Address; id: string }>;
};
export const abi = {
  Accreditation: read("deployments/abi/Accreditation.json") as Abi,
  Attestations: read("deployments/abi/Attestations.json") as Abi,
  Passports: read("deployments/abi/Passports.json") as Abi,
};

export const hederaTestnet = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [process.env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api"] } },
  blockExplorers: { default: { name: "HashScan", url: "https://hashscan.io/testnet" } },
});

export const client = createPublicClient({ chain: hederaTestnet, transport: http() });

/** The on-chain installation id: keccak256 of "<country>/<registry id>". */
export const installationId = (country: string, registryId: string): Hex =>
  keccak256(toBytes(`${country.toUpperCase()}/${registryId}`));

/** Decode the first event of a given name that a contract emitted in a tx. */
export async function eventFromTx(tx: Hex, contract: keyof typeof abi, eventName: string) {
  const receipt = await client.getTransactionReceipt({ hash: tx });
  if (receipt.status !== "success") throw new Error(`transaction ${tx} reverted`);
  const address = deployment.contracts[contract].address.toLowerCase();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== address) continue;
    try {
      const ev = decodeEventLog({ abi: abi[contract], data: log.data, topics: log.topics });
      if (ev.eventName === eventName) return ev.args as unknown as Record<string, unknown>;
    } catch {
      // another event of the same contract
    }
  }
  throw new Error(`no ${eventName} event from ${contract} in ${tx}`);
}

export async function readContract<T>(contract: keyof typeof abi, functionName: string, args: unknown[] = []) {
  return (await client.readContract({
    address: deployment.contracts[contract].address,
    abi: abi[contract],
    functionName,
    args,
  })) as T;
}
