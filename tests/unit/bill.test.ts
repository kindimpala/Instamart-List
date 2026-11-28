import { describe, expect, it } from 'vitest';
import { classify, parseAmount, parseBill } from '../../server/core/bill';

describe('parseAmount', () => {
  it.each([
    ['₹52', 52],
    ['₹1,234.50', 1234.5],
    ['FREE', 0],
    [' free ', 0],
    ['Rs. 30', 30],
    ['n/a', null],
  ])('%s -> %s', (input, expected) => expect(parseAmount(input)).toBe(expected));
});

describe('classify', () => {
  it('recognises the common labels', () => {
    expect(classify('Item Total')).toBe('itemTotal');
    expect(classify('Handling Fee')).toBe('handling');
    expect(classify('Delivery Fee')).toBe('delivery');
    expect(classify('Surge Fee')).toBe('surge');
    expect(classify('Small cart fee')).toBe('other');
  });
});

describe('parseBill', () => {
  it('parses a bill with free delivery and surge', () => {
    const bill = parseBill({
      lineItems: [
        { label: 'Item Total', value: '₹245' },
        { label: 'Handling Fee', value: '₹9' },
        { label: 'Delivery Fee', value: 'FREE' },
        { label: 'Surge Fee', value: '₹25' },
      ],
      toPay: { label: 'To Pay', value: '₹279' },
    })!;
    expect(bill.itemTotal).toBe(245);
    expect(bill.handlingFee).toBe(9);
    expect(bill.deliveryFee).toBe(0);
    expect(bill.deliveryFree).toBe(true);
    expect(bill.surgeFee).toBe(25);
    expect(bill.toPay).toBe(279);
  });

  it('has no surge and keeps unknown lines', () => {
    const bill = parseBill({
      lineItems: [
        { label: 'Item Total', value: '₹100' },
        { label: 'Delivery Fee', value: '₹30' },
        { label: 'Small cart fee', value: '₹15' },
      ],
      toPay: { label: 'To Pay', value: '₹145' },
    })!;
    expect(bill.surgeFee).toBeNull();
    expect(bill.deliveryFree).toBe(false);
    expect(bill.other).toEqual([{ label: 'Small cart fee', value: '₹15' }]);
  });

  it('returns null without a toPay line', () => {
    expect(parseBill(undefined)).toBeNull();
  });
});
