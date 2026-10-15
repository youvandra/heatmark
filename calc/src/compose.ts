/**
 * Specific embedded emissions of a good, composed from its own process and
 * its precursors, in the same integer units the Passports contract uses:
 * intensity in micro-tonnes CO2e per tonne (1_000_000 = 1.000 t/t), mass in kg.
 *
 *   see = own + Σ (precursorMass × precursorSee) / mass      (floored)
 *
 * This must stay bit-for-bit equal to Passports.sol; the forge differential
 * test reads fixtures generated from this function.
 */
export interface PrecursorUse {
  massKg: bigint;
  seeMicro: bigint;
}

export function composeSee(ownMicro: bigint, massKg: bigint, uses: PrecursorUse[]): bigint {
  if (massKg <= 0n) throw new Error("mass must be positive");
  let acc = 0n;
  for (const u of uses) acc += u.massKg * u.seeMicro;
  return ownMicro + acc / massKg;
}

export const toMicro = (tPerT: number): bigint => BigInt(Math.round(tPerT * 1_000_000));
export const fromMicro = (micro: bigint): number => Number(micro) / 1_000_000;
export const tonnes = (t: number): bigint => BigInt(Math.round(t * 1000));
