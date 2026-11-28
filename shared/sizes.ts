/** Pack-size parsing shared by server matching and client display. */

export interface ParsedSize {
  amount: number; // in base unit
  unit: 'ml' | 'g' | 'pcs';
}

const UNIT_MAP: Array<[RegExp, ParsedSize['unit'], number]> = [
  [/^(kg|kgs|kilo|kilos|kilogram|kilograms)$/, 'g', 1000],
  [/^(g|gm|gms|gram|grams|gr)$/, 'g', 1],
  [/^(l|ltr|ltrs|litre|litres|liter|liters)$/, 'ml', 1000],
  [/^(ml|mls)$/, 'ml', 1],
  [/^(pc|pcs|piece|pieces|pack|packs|nos|units?)$/, 'pcs', 1],
];

/** "1 kg" -> {1000,g}; "500ml" -> {500,ml}; "6 pcs" -> {6,pcs}; "75 g x 4" -> {300,g} */
export function parseSize(text: string | null | undefined): ParsedSize | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const m = /(\d+(?:\.\d+)?)\s*([a-z]+)/.exec(t);
  if (!m) return null;
  const unitHit = UNIT_MAP.find(([re]) => re.test(m[2]));
  if (!unitHit) return null;
  let amount = Number(m[1]) * unitHit[2];
  const mult = /x\s*(\d+)/.exec(t.slice(m.index + m[0].length));
  if (mult) amount *= Number(mult[1]);
  return { amount, unit: unitHit[1] };
}

/** Lower is closer. Infinity when units differ or a size is unknown. */
export function sizeDistance(a: string | null | undefined, b: string | null | undefined): number {
  const pa = parseSize(a);
  const pb = parseSize(b);
  if (!pa || !pb || pa.unit !== pb.unit) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.log(pa.amount / pb.amount));
}

export const formatRupees = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;
