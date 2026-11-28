/**
 * Turns the Instamart cart `billBreakdown` (free-form { label, value } lines) into
 * a typed bill. The reference schema defines no fixed fee fields, so we classify
 * by label and keep every line we don't recognise so nothing is hidden or invented.
 */
import type { BillLine, CartData } from '../../shared/instamart.js';
import type { Bill } from '../../shared/cards.js';

/** "₹1,234.50" -> 1234.5, "FREE" -> 0, anything unparseable -> null. */
export function parseAmount(value: string): number | null {
  if (/^\s*free\s*$/i.test(value)) return 0;
  const cleaned = value
    .replace(/[,\s]/g, '')
    .replace(/^(rs\.?|inr|₹)/i, '')
    .replace(/^[^0-9-]+/, '');
  const m = /^-?\d+(\.\d+)?/.exec(cleaned);
  return m ? Number(m[0]) : null;
}

type Kind = 'itemTotal' | 'handling' | 'delivery' | 'surge' | 'other';
export function classify(label: string): Kind {
  const l = label.toLowerCase();
  if (/item\s*total|items?\s*total|sub\s*total/.test(l)) return 'itemTotal';
  if (/surge|peak|high demand|rain/.test(l)) return 'surge';
  if (/handling|packag|platform/.test(l)) return 'handling';
  if (/deliver/.test(l)) return 'delivery';
  return 'other';
}

export function parseBill(breakdown: CartData['billBreakdown'] | undefined | null): Bill | null {
  if (!breakdown?.toPay) return null;
  const bill: Bill = {
    itemTotal: null,
    handlingFee: null,
    deliveryFee: null,
    deliveryFree: false,
    surgeFee: null,
    other: [],
    toPay: parseAmount(breakdown.toPay.value) ?? 0,
    toPayLabel: breakdown.toPay.value,
    lines: breakdown.lineItems.map((l: BillLine) => ({ label: l.label, value: l.value, kind: classify(l.label) })),
  };
  for (const line of breakdown.lineItems ?? []) {
    const amount = parseAmount(line.value);
    switch (classify(line.label)) {
      case 'itemTotal':
        bill.itemTotal = amount;
        break;
      case 'handling':
        bill.handlingFee = (bill.handlingFee ?? 0) + (amount ?? 0);
        break;
      case 'delivery':
        bill.deliveryFee = amount;
        bill.deliveryFree = /free/i.test(line.value) || amount === 0;
        break;
      case 'surge':
        if (amount && amount > 0) bill.surgeFee = (bill.surgeFee ?? 0) + amount;
        break;
      default:
        bill.other.push({ label: line.label, value: line.value });
    }
  }
  return bill;
}
