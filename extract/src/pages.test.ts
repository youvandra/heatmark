import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pdfPages } from "./pages";

test("reading a PDF's text leaves the caller's bytes intact", async () => {
  const bytes = new Uint8Array(readFileSync(resolve(import.meta.dir, "../../demo/documents/melt-shop/a-01-natural-gas-2026.pdf")));
  const before = bytes.byteLength;
  const pages = await pdfPages(bytes);
  expect(pages[0]).toContain("TOTAL CONSUMPTION 2026: 90,000,000 kWh");
  expect(bytes.byteLength).toBe(before);
  expect(Buffer.from(bytes).toString("base64").length).toBeGreaterThan(0);
});
