import { describe, expect, test } from "bun:test";
import { checkField, numbersIn } from "./verify";
import { summarize } from "./activity";

describe("numbersIn", () => {
  test("reads both thousands conventions", () => {
    expect(numbersIn("Toplam: 1.234.567,8 kWh")).toContain(1234567.8);
    expect(numbersIn("Total 1,234,567.8 kWh")).toContain(1234567.8);
    expect(numbersIn("Elektrot 12 ton")).toContain(12);
  });
});

describe("checkField", () => {
  const pages = ["FATURA\nDoğal gaz tüketimi   1.234.567,8 kWh\nDönem: Ocak 2026", "Sayfa 2"];

  test("verified when the snippet is on the cited page and holds the value", () => {
    expect(checkField(pages, { value: 1234567.8, page: 1, snippet: "Doğal gaz tüketimi 1.234.567,8 kWh" })).toBe("verified");
  });

  test("whitespace and case differences are tolerated", () => {
    expect(checkField(pages, { value: 1234567.8, page: 1, snippet: "doğal  GAZ tüketimi\n1.234.567,8 kwh" })).toBe("verified");
  });

  test("wrong page is caught", () => {
    expect(checkField(pages, { value: 1234567.8, page: 2, snippet: "Doğal gaz tüketimi 1.234.567,8 kWh" })).toBe("snippet_not_found");
  });

  test("an invented snippet is caught", () => {
    expect(checkField(pages, { value: 1000, page: 1, snippet: "Doğal gaz tüketimi 1.000 kWh" })).toBe("snippet_not_found");
  });

  test("a value that differs from its snippet is caught", () => {
    expect(checkField(pages, { value: 123456.78, page: 1, snippet: "Doğal gaz tüketimi 1.234.567,8 kWh" })).toBe("value_not_in_snippet");
  });

  test("a page that doesn't exist is caught", () => {
    expect(checkField(pages, { value: 1, page: 9, snippet: "x" })).toBe("snippet_not_found");
  });
});

describe("summarize", () => {
  test("sums documents and converts units in code", () => {
    const s = summarize([
      { key: "production_t", value: 30000 },
      { key: "natural_gas_kwh", value: 1_000_000 },
      { key: "natural_gas_kwh", value: 500_000 },
      { key: "electrode_kg", value: 45_000 },
      { key: "electricity_kwh", value: 12_000_000 },
    ]);
    expect(s.activity.productionT).toBe(30000);
    expect(s.activity.naturalGasGJ).toBeCloseTo(1_500_000 * 0.0036, 9);
    expect(s.activity.electrodeT).toBe(45);
    expect(s.activity.electricityMWh).toBe(12000);
    expect(s.unresolved).toEqual([]);
  });

  test("Sm³ gas and missing production are flagged, not guessed", () => {
    const s = summarize([{ key: "natural_gas_sm3", value: 1000 }]);
    expect(s.unresolved.map((u) => u.key).sort()).toEqual(["natural_gas_sm3", "production_t"]);
  });
});
