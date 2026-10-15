// The accreditor adds the demo verifier. Signed with the ACCREDITOR key, the
// only key Accreditation accepts for this; the deployer has no say.
//
//   bun run contracts/script/add-verifier.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { encodeFunctionData, type Abi, type Address } from "viem";
import { env, pub, root, signer } from "./hedera";

const NAME = "Heatmark Demo Verifier (synthetic, not an accredited body)";

const deployment = JSON.parse(readFileSync(resolve(root, "deployments/hedera-testnet.json"), "utf8"));
const abi = JSON.parse(readFileSync(resolve(root, "deployments/abi/Accreditation.json"), "utf8")) as Abi;
const address = deployment.contracts.Accreditation.address as Address;
const verifier = env.VERIFIER_ADDRESS as Address;

if (await pub.readContract({ address, abi, functionName: "isActive", args: [verifier] })) {
  console.log(`${verifier} is already an active verifier`);
  process.exit(0);
}

const wallet = signer("ACCREDITOR");
const data = encodeFunctionData({ abi, functionName: "addVerifier", args: [verifier, NAME] });
const estimate = await pub.estimateGas({ account: wallet.account.address, to: address, data });
const hash = await wallet.sendTransaction({ to: address, data, gas: (estimate * 12n) / 10n });
const receipt = await pub.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error(`addVerifier reverted: ${hash}`);

const active = await pub.readContract({ address, abi, functionName: "isActive", args: [verifier] });
console.log(`addVerifier ${verifier} → active=${active}, gas ${receipt.gasUsed}, tx ${hash}`);
