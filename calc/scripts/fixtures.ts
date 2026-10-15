// Writes contracts/test/fixtures/compose.json: random cases whose expected
// SEE comes from calc's composeSee. The forge differential test replays each
// case on chain and must land on the same integer.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { composeSee } from "../src/index";

const N = 120;
const MAX_USES = 3;
let seed = 0x5eedc0den;
// xorshift64*, so the fixture file is reproducible
function rand(max: bigint): bigint {
  seed ^= seed >> 12n;
  seed ^= (seed << 25n) & 0xffff_ffff_ffff_ffffn;
  seed ^= seed >> 27n;
  return ((seed * 0x2545f4914f6cdd1dn) & 0xffff_ffff_ffff_ffffn) % max;
}

const own: string[] = [], mass: string[] = [], n: string[] = [], expected: string[] = [];
const useMass: string[][] = [[], [], []], useSee: string[][] = [[], [], []];

for (let c = 0; c < N; c++) {
  const m = 1n + rand(2_000_000_000n); // up to 2 Mt in kg
  const o = rand(3_000_000n); // up to 3 t/t
  const k = Number(rand(BigInt(MAX_USES + 1)));
  const uses = [];
  for (let i = 0; i < MAX_USES; i++) {
    const um = i < k ? 1n + rand(2n * m) : 0n; // precursor mass may exceed product mass (yield loss)
    const us = i < k ? rand(4_000_000n) : 0n;
    useMass[i].push(um.toString());
    useSee[i].push(us.toString());
    if (i < k) uses.push({ massKg: um, seeMicro: us });
  }
  own.push(o.toString());
  mass.push(m.toString());
  n.push(String(k));
  expected.push(composeSee(o, m, uses).toString());
}

const out = resolve(dirname(new URL(import.meta.url).pathname), "../../contracts/test/fixtures/compose.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    { own, mass, n, m0: useMass[0], m1: useMass[1], m2: useMass[2], s0: useSee[0], s1: useSee[1], s2: useSee[2], expected },
    null,
    1,
  ),
);
console.log(`wrote ${N} cases to ${out}`);
