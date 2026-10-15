/**
 * Deterministic check on every field the model reports: its snippet must
 * appear on the page it cites, and its value must appear in the snippet.
 * A field that fails is shown to the operator as unverified and can't be
 * submitted until they confirm or correct it against the document.
 */
export type FieldCheck = "verified" | "snippet_not_found" | "value_not_in_snippet";

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Every number written in the snippet, read both ways a document might
 * group thousands: "1.234,5" (Turkish, German) and "1,234.5" (English).
 */
export function numbersIn(snippet: string): number[] {
  const out = new Set<number>();
  for (const raw of snippet.match(/\d[\d.,\s]*\d|\d/g) ?? []) {
    const t = raw.replace(/\s/g, "");
    const commaDecimal = Number(t.replace(/\./g, "").replace(",", "."));
    const dotDecimal = Number(t.replace(/,/g, ""));
    if (Number.isFinite(commaDecimal)) out.add(commaDecimal);
    if (Number.isFinite(dotDecimal)) out.add(dotDecimal);
    // A comma or space can also separate columns ("TOTAL 2026,400000" in a
    // CSV), so each separated piece counts as a number on its own too.
    for (const piece of raw.split(/[,;\s]+/)) {
      const n = Number(piece);
      if (piece && Number.isFinite(n)) out.add(n);
    }
  }
  return [...out];
}

function closeTo(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-6);
}

export function checkField(pages: string[], field: { value: number; page: number; snippet: string }): FieldCheck {
  const page = pages[field.page - 1];
  if (page === undefined || !squash(page).includes(squash(field.snippet))) return "snippet_not_found";
  // No unit conversion is allowed here: the schema has a key per unit
  // (electrode_kg, natural_gas_kwh, ...) and conversion happens in code.
  if (!numbersIn(field.snippet).some((n) => closeTo(n, field.value))) return "value_not_in_snippet";
  return "verified";
}
