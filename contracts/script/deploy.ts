// Deploys Accreditation → Attestations → Passports to Hedera testnet and
// writes deployments/hedera-testnet.json with both names of every contract:
// the 0x EVM address (what wallets sign against) and the 0.0.x id (what
// HashScan and people read).
//
// Hedera charges at least 80% of the gas limit, so each deploy sets its limit
// from an estimate plus a small margin rather than a blanket high value.
//
//   forge build && bun run contracts/script/deploy.ts
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createPublicClient, createWalletClient, defineChain, encodeDeployData, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = resolve(dirname(new URL(import.meta.url).pathname), "../..");
const env = Object.fromEntries(
  readFileSync(resolve(root, ".env"), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);

const hederaTestnet = defineChain({
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api"] } },
  blockExplorers: { default: { name: "HashScan", url: "https://hashscan.io/testnet" } },
});
const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1";

const deployer = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY as Hex);
const accreditor = env.ACCREDITOR_ADDRESS as Address;
if (!accreditor) throw new Error("ACCREDITOR_ADDRESS missing from .env");

const pub = createPublicClient({ chain: hederaTestnet, transport: http() });
const wallet = createWalletClient({ account: deployer, chain: hederaTestnet, transport: http() });

function artifact(name: string) {
  const a = JSON.parse(readFileSync(resolve(root, `contracts/out/${name}.sol/${name}.json`), "utf8"));
  return { abi: a.abi, bytecode: a.bytecode.object as Hex };
}

async function contractId(address: Address): Promise<string> {
  // The mirror node lags consensus by a few seconds.
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${MIRROR}/contracts/${address}`);
    if (r.ok) return (await r.json()).contract_id;
    await new Promise((s) => setTimeout(s, 1500));
  }
  throw new Error(`mirror node never saw ${address}`);
}

async function deploy(name: string, args: unknown[]) {
  const { abi, bytecode } = artifact(name);
  const estimate = await pub.estimateGas({
    account: deployer.address,
    data: encodeDeployData({ abi, bytecode, args }),
  });
  const gas = (estimate * 12n) / 10n;
  const hash = await wallet.deployContract({ abi, bytecode, args, gas });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`${name} deploy failed: ${hash}`);
  const address = receipt.contractAddress;
  const id = await contractId(address);
  console.log(`${name.padEnd(14)} ${id.padEnd(14)} ${address}  gas ${receipt.gasUsed}/${gas}  tx ${hash}`);
  return { address, id, tx: hash, gasUsed: receipt.gasUsed.toString(), gasLimit: gas.toString() };
}

const before = await pub.getBalance({ address: deployer.address });
console.log(`deployer ${deployer.address}, ${Number(before) / 1e18} HBAR`);

const accreditation = await deploy("Accreditation", [accreditor]);
const attestations = await deploy("Attestations", [accreditation.address]);
const passports = await deploy("Passports", [attestations.address]);

const after = await pub.getBalance({ address: deployer.address });
console.log(`spent ${(Number(before - after) / 1e18).toFixed(4)} HBAR`);

const out = resolve(root, "deployments/hedera-testnet.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      network: "hedera-testnet",
      chainId: 296,
      deployedAt: new Date().toISOString(),
      deployer: deployer.address,
      accreditor,
      contracts: { Accreditation: accreditation, Attestations: attestations, Passports: passports },
    },
    null,
    2,
  ) + "\n",
);
console.log(`wrote ${out}`);
