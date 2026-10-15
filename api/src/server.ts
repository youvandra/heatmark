import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { verifyMessage } from "viem";
import { extractDocument } from "../../extract/src/extract";
import { createApp, type AttestedEvent } from "./app";
import { eventFromTx, installationId, readContract } from "./chain";
import { openDb } from "./db";

const dataDir = process.env.HEATMARK_DATA ?? resolve(import.meta.dir, "../../data");
mkdirSync(dataDir, { recursive: true });

const app = createApp({
  db: openDb(resolve(dataDir, "heatmark.db")),
  blobDir: resolve(dataDir, "blobs"),
  extract: (bytes, mediaType, ctx) => extractDocument(bytes, mediaType, ctx),
  attestedEvent: async (tx) => (await eventFromTx(tx, "Attestations", "Attested")) as unknown as AttestedEvent,
  verifierSigned: async (address, message, signature) =>
    (await verifyMessage({ address, message, signature })) &&
    (await readContract<boolean>("Accreditation", "isActive", [address])),
  installationId: (country, registryId) => installationId(country, registryId),
});

const port = Number(process.env.PORT ?? 8796);
export default { port, fetch: app.fetch, maxRequestBodySize: 25 * 1024 * 1024 };
console.log(`heatmark api on :${port}, data in ${dataDir}`);
