import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { verifyMessage } from "viem";
import { extractDocument } from "../../extract/src/extract";
import { createApp, type AttestedEvent } from "./app";
import { chainReader, eventFromTx, installationId, publicConfig, readContract } from "./chain";
import { openDb } from "./db";

const dataDir = process.env.HEATMARK_DATA ?? resolve(import.meta.dir, "../../data");
mkdirSync(dataDir, { recursive: true });

// With LOCAL_MODEL_ID set in .env, extraction goes through the git-ignored
// local adapter; otherwise through the Anthropic SDK.
const extract: typeof extractDocument = process.env.LOCAL_MODEL_ID
  ? (await import("../../extract/src/local/model" + ".ts")).extractLocal
  : extractDocument;

const app = createApp({
  db: openDb(resolve(dataDir, "heatmark.db")),
  blobDir: resolve(dataDir, "blobs"),
  extract: (bytes, mediaType, ctx) => extract(bytes, mediaType, ctx),
  attestedEvent: async (tx) => (await eventFromTx(tx, "Attestations", "Attested")) as unknown as AttestedEvent,
  verifierSigned: async (address, message, signature) =>
    (await verifyMessage({ address, message, signature })) &&
    (await readContract<boolean>("Accreditation", "isActive", [address])),
  installationId: (country, registryId) => installationId(country, registryId),
  roleOf: async (address) => {
    if (await readContract<boolean>("Accreditation", "isActive", [address])) return "verifier";
    const accreditor = await readContract<string>("Accreditation", "accreditor");
    return accreditor.toLowerCase() === address.toLowerCase() ? "accreditor" : null;
  },
  chain: chainReader,
  config: publicConfig,
});

const port = Number(process.env.PORT ?? 8796);
export default { port, fetch: app.fetch, maxRequestBodySize: 25 * 1024 * 1024 };
console.log(`heatmark api on :${port}, data in ${dataDir}`);
