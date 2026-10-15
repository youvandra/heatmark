// Tops up each demo role from the deployer, so every role signs with its own
// key. A transfer to an address Hedera hasn't seen creates the account, and
// that creation is billed as ~608k gas (~0.67 HBAR at 1.1e-6 HBAR/gas) on
// top of the value: measured on testnet 15 Oct 2026. Budget for it.
//
//   bun run contracts/script/fund.ts
import { parseEther, type Address } from "viem";
import { accountId, env, pub, signer } from "./hedera";

// HBAR per role: enough for the demo's writes at ~1.1e-6 HBAR/gas.
const TARGETS: Record<string, string> = {
  ACCREDITOR: "0.5",
  VERIFIER: "1.5",
  MELT_SHOP: "1.5",
  ROLLING_MILL: "1.5",
  IMPORTER: "0.5",
};

const deployer = signer("DEPLOYER");
console.log(`deployer ${await pub.getBalance({ address: deployer.account.address }).then((b) => Number(b) / 1e18)} HBAR`);

for (const [role, amount] of Object.entries(TARGETS)) {
  const to = env[`${role}_ADDRESS`] as Address;
  const have = await pub.getBalance({ address: to });
  const want = parseEther(amount);
  if (have >= want) {
    console.log(`${role.padEnd(13)} already ${Number(have) / 1e18} HBAR`);
    continue;
  }
  // Hedera's value unit is the tinybar (1e-8 HBAR); the relay rejects wei
  // amounts finer than 1e10, so round down to a whole tinybar.
  const value = ((want - have) / 10_000_000_000n) * 10_000_000_000n;
  const hash = await deployer.sendTransaction({ to, value });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${role} top-up failed: ${hash}`);
  console.log(`${role.padEnd(13)} ${(await accountId(to)).padEnd(14)} +${Number(value) / 1e18} HBAR  tx ${hash}`);
}

console.log(`deployer left ${await pub.getBalance({ address: deployer.account.address }).then((b) => Number(b) / 1e18)} HBAR`);
