// Copies each contract's ABI out of forge's build tree so the API and web
// can import them without a Foundry toolchain.
//   forge build && bun run contracts/script/export-abi.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { root } from "./hedera";

const out = resolve(root, "deployments/abi");
mkdirSync(out, { recursive: true });
for (const name of ["Accreditation", "Attestations", "Passports"]) {
  const { abi } = JSON.parse(readFileSync(resolve(root, `contracts/out/${name}.sol/${name}.json`), "utf8"));
  writeFileSync(resolve(out, `${name}.json`), JSON.stringify(abi, null, 2) + "\n");
  console.log(`${name}: ${abi.length} entries`);
}
