import { extractText, getDocumentProxy } from "unpdf";

/** Text of each page, so a cited snippet can be checked against its page. */
export async function pdfPages(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}

/** CSV / plain-text documents are one page. */
export function textPages(bytes: Uint8Array): string[] {
  return [new TextDecoder().decode(bytes)];
}
