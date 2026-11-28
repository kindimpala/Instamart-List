import { describe, expect, it } from 'vitest';
import { extractItemsText, extractListName, findListRef, parseBudget, parseEdit, parseItemPhrase, splitItems } from '../../server/core/agent/parse';

describe('item phrases', () => {
  it.each([
    ['milk', { query: 'milk', quantity: 1, size: null }],
    ['2 milk', { query: 'milk', quantity: 2, size: null }],
    ['1kg atta', { query: 'atta', quantity: 1, size: '1 kg' }],
    ['2 x 500ml curd', { query: 'curd', quantity: 2, size: '500 ml' }],
    ['6 eggs', { query: 'eggs', quantity: 1, size: '6 pcs' }],
    ['a dozen eggs', { query: 'eggs', quantity: 1, size: '12 pcs' }],
    ['two packets of maggi', { query: 'maggi', quantity: 2, size: null }],
    ['toned milk 1 L', { query: 'toned milk', quantity: 1, size: '1 L' }],
  ])('%s', (input, expected) => expect(parseItemPhrase(input)).toEqual(expected));
});

describe('create requests', () => {
  it('extracts items and name', () => {
    const t = 'Create a list called Weekly staples with milk, bread, 6 eggs and 1kg atta';
    expect(extractListName(t)).toBe('Weekly staples');
    expect(splitItems(extractItemsText(t))).toEqual(['milk', 'bread', '6 eggs', '1kg atta']);
  });
  it('handles a list without a name', () => {
    expect(splitItems(extractItemsText('make a list: onions, tomatoes'))).toEqual(['onions', 'tomatoes']);
  });
  it('parses budgets', () => {
    expect(parseBudget('keep it under ₹150')).toBe(150);
    expect(parseBudget('order L1 under 300')).toBe(300);
    expect(parseBudget('budget of Rs. 500')).toBe(500);
    expect(parseBudget('add 2 milk')).toBeNull();
  });
});

describe('list refs', () => {
  const names = [{ badge: 'L1', name: 'Weekly staples' }];
  it('finds badges and names', () => {
    expect(findListRef('order l1 please', names)).toBe('L1');
    expect(findListRef('order my weekly staples', names)).toBe('L1');
    expect(findListRef('order something', names)).toBeNull();
  });
});

describe('edit requests', () => {
  const names = [{ badge: 'L1', name: 'Weekly staples' }];
  it('parses add/remove/qty/rename', () => {
    const ops = parseEdit('Add 2 bananas and 1kg onions to L1, remove eggs, make milk 2 and rename it to Weekend list', names);
    expect(ops.add.map((a) => a.query)).toEqual(['bananas', 'onions']);
    expect(ops.remove).toEqual(['eggs']);
    expect(ops.setQuantity).toEqual([{ item: 'milk', quantity: 2 }]);
    expect(ops.rename).toBe('Weekend list');
  });
  it('parses a budget change', () => {
    expect(parseEdit('set budget for L1 to ₹400', names).budget).toBe(400);
    expect(parseEdit('remove the budget from L1', names).budget).toBeNull();
  });
  it('strips list names', () => {
    const ops = parseEdit('add butter to weekly staples', names);
    expect(ops.add.map((a) => a.query)).toEqual(['butter']);
  });
});
