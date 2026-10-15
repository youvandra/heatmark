import { extractText, getDocumentProxy } from "unpdf";

/** Text of each page, so a cited snippet can be checked against its page. */
export async function pdfPages(bytes: Uint8Array): Promise<string[]> {
  // pdf.js takes ownership of the buffer it is given and detaches it; hand it
  // a copy so the caller can still send the original bytes on.
  const pdf = await getDocumentProxy(bytes.slice());
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}

/** CSV / plain-text documents are one page. */
export function textPages(bytes: Uint8Array): string[] {
  return [new TextDecoder().decode(bytes)];
}
