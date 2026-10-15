import { describe, expect, test } from "bun:test";
import { attributedEmissions, benchmarkFor, compare, composeSee, defaultFor, toMicro, tonnes } from "./index";

describe("tables", () => {
  test("Türkiye rebar default is the BF/BOF row", () => {
    const row = defaultFor("TR", "7214 99 10");
    expect(row.table).toBe("TR");
    expect(row.total).toBe(2.31);
    expect(row.y2026).toBe(2.541);
    expect(row.route).toBe("C");
  });

  test("longest listed prefix wins", () => {
    expect(defaultFor("TR", "7214 10 00").total).toBe(3.087);
    expect(defaultFor("TR", "7214 20 00").total).toBe(2.31);
  });

  test("Türkiye has no clinker row, so the other-countries table applies", () => {
    const grey = defaultFor("TR", "2523 10 00", "grey");
    expect(grey.table).toBe("OTHER");
    expect(grey.total).toBe(1.41);
    expect(defaultFor("TR", "2523 10 00", "white").total).toBe(1.37);
  });

  test("benchmarks by route", () => {
    expect(benchmarkFor("72149910", "C")).toBe(1.364);
    expect(benchmarkFor("72149910", "E")).toBe(0.066);
    expect(benchmarkFor("25231000", "A")).toBe(0.666);
    expect(() => benchmarkFor("72149910", "K")).toThrow();
  });
});

describe("compare", () => {
  test("scrap-EAF rebar at 0.40 t/t saves about €72/t in 2026", () => {
    const c = compare({ country: "TR", cn: "72149910" }, 0.4, "E", 2026, 82.32);
    expect(c.certsDefault).toBeCloseTo(2.541 - 1.364 * 0.975, 6);
    expect(c.certsActual).toBeCloseTo(0.4 - 0.066 * 0.975, 6);
    expect(Math.round(c.eurPerTonne)).toBe(72);
  });

  test("the gap widens as free allocation phases out", () => {
    const y26 = compare({ country: "TR", cn: "72149910" }, 0.4, "E", 2026, 82.32);
    const y28 = compare({ country: "TR", cn: "72149910" }, 0.4, "E", 2028, 82.32);
    expect(y28.eurPerTonne).toBeGreaterThan(y26.eurPerTonne);
    expect(Math.round(y28.eurPerTonne)).toBe(118);
  });

  test("obligation never goes negative", () => {
    const c = compare({ country: "TR", cn: "72149910" }, 0.01, "E", 2026, 82.32);
    expect(c.certsActual).toBe(0);
  });
});

describe("composeSee", () => {
  test("rebar from billet: own + precursor share", () => {
    // 500 t rebar, own 0.05 t/t, 530 t billet at 0.33 t/t
    const see = composeSee(toMicro(0.05), tonnes(500), [{ massKg: tonnes(530), seeMicro: toMicro(0.33) }]);
    expect(see).toBe(50_000n + (530_000n * 330_000n) / 500_000n);
    expect(Number(see) / 1e6).toBeCloseTo(0.3998, 4);
  });

  test("no precursors leaves own intensity", () => {
    expect(composeSee(123n, 1000n, [])).toBe(123n);
  });
});

describe("attributedEmissions", () => {
  test("sums source streams and divides by production", () => {
    const r = attributedEmissions({ productionT: 1000, naturalGasGJ: 2000, electrodeT: 2, limestoneT: 30 });
    expect(r.lines.map((l) => l.stream)).toEqual(["natural gas", "electrodes", "limestone"]);
    const expected = 2000 * 0.0561 + 2 * 0.82 * (44 / 12) + 30 * 0.43971;
    expect(r.totalT).toBeCloseTo(expected, 9);
    expect(r.ownIntensity).toBeCloseTo(expected / 1000, 12);
  });

  test("electricity is reported, never counted", () => {
    expect(attributedEmissions({ productionT: 10, electricityMWh: 5000 }).totalT).toBe(0);
  });

  test("zero production is refused", () => {
    expect(() => attributedEmissions({ productionT: 0 })).toThrow();
  });
});
