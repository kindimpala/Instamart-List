/** Plain-language parsing used by the rules agent (works with no API key). */
import type { ItemSpec } from './tools.js';

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, dozen: 12, couple: 2 };
const SIZE_RE = /(\d+(?:\.\d+)?)\s*(kgs?|kilos?|kilograms?|grams?|gms?|g|gm|ltrs?|litres?|liters?|l|ml|pcs|pieces?)\b/i;

export function parseBudget(text: string): number | null {
  const b = /\bbudget\b[^\d₹]{0,25}?(?:rs\.?|₹|inr)?\s*(\d{2,6})/i.exec(text.replace(/\bl\d{1,2}\b/gi, ' '));
  if (b) return Number(b[1]);
  const m = /(?:under|below|within|less than|upto|up to|max(?:imum)?|budget(?:\s+(?:of|to|is|at))?|limit(?:\s+(?:of|to))?|cap(?:\s+(?:of|at))?|keep it (?:under|below))\s*(?:of\s*)?(?:rs\.?|₹|inr)?\s*(\d{2,6})/i.exec(text);
  return m ? Number(m[1]) : null;
}

export function stripBudget(text: string): string {
  return text.replace(/,?\s*(?:and\s+)?(?:keep(?:ing)? it\s+)?(?:under|below|within|less than|upto|up to|budget(?:\s+(?:of|to|is|at))?|limit(?:\s+(?:of|to))?|max(?:imum)?)\s*(?:of\s*)?(?:rs\.?|₹|inr)?\s*\d{2,6}\b/gi, ' ');
}

/** Finds "L1" or a known list name in the text. */
export function findListRef(text: string, listNames: Array<{ badge: string; name: string }>): string | null {
  const badge = /\b(l\d{1,2})\b/i.exec(text);
  if (badge) return badge[1].toUpperCase();
  const quoted = /["“']([^"”']{2,40})["”']/.exec(text);
  if (quoted) return quoted[1];
  const lower = text.toLowerCase();
  const byName = [...listNames].sort((a, b) => b.name.length - a.name.length).find((l) => l.name.length > 2 && lower.includes(l.name.toLowerCase()));
  return byName ? byName.badge : null;
}

/** "2 x 1kg atta" / "6 eggs" / "milk 500ml" / "a dozen bananas" -> ItemSpec */
export function parseItemPhrase(raw: string): ItemSpec | null {
  let t = raw.trim().replace(/^[-*•]\s*/, '').replace(/[.!?]+$/, '');
  t = t.replace(/^(?:and|also|plus|some|of|please|pls)\s+/i, '');
  if (!t) return null;
  let quantity = 1;
  let size: string | null = null;
  const sizeMatch = SIZE_RE.exec(t);
  if (sizeMatch) {
    const unit = sizeMatch[2].toLowerCase();
    const u = /^k/.test(unit) ? 'kg' : /^(g|gm|gms|gram|grams)$/.test(unit) ? 'g' : /^(ml)$/.test(unit) ? 'ml' : /^(l|ltr|ltrs|litre|litres|liter|liters)$/.test(unit) ? 'L' : 'pcs';
    size = `${sizeMatch[1]} ${u}`;
    t = (t.slice(0, sizeMatch.index) + ' ' + t.slice(sizeMatch.index + sizeMatch[0].length)).trim();
  }
  const dozen = /^(?:a\s+)?dozen\s+(?:of\s+)?/i.exec(t);
  if (dozen) {
    if (!size) size = '12 pcs';
    t = t.slice(dozen[0].length);
  }
  const qtyX = /^(\d{1,2})\s*(?:x|×|\*)\s*/i.exec(t) ?? /\s*(?:x|×)\s*(\d{1,2})$/i.exec(t);
  if (qtyX) {
    quantity = Number(qtyX[1]);
    t = t.replace(qtyX[0], ' ').trim();
  } else {
    const lead = /^(\d{1,2}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|dozen|couple(?: of)?)\s+/i.exec(t);
    if (lead) {
      const w = lead[1].toLowerCase().replace(' of', '');
      const n = /^\d+$/.test(w) ? Number(w) : NUMBER_WORDS[w] ?? 1;
      if (w === 'dozen' && !size) size = '12 pcs';
      else if (size === null && /egg|banana|lemon|apple/i.test(t) && n > 1) size = `${n} pcs`;
      else quantity = n;
      t = t.slice(lead[0].length);
    }
  }
  t = t
    .replace(/^(?:packets?|packs?|bottles?|boxes?|bags?|loaf|loaves|tins?|cans?)\s+(?:of\s+)?/i, '')
    .replace(/^(?:of)\s+/i, '')
    .replace(/\s+(?:packets?|packs?)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || t.length < 2) return null;
  return { query: t, quantity: Math.max(1, Math.min(20, quantity)), size };
}

export function splitItems(text: string): string[] {
  return text
    .split(/\n|,|;|\+|\band\b|&/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function extractListName(text: string): string | null {
  const m = /(?:called|named|name it|call it|titled)\s+["“']?([^"”',.]+?)["”']?(?:\s+(?:with|for|containing|that has)\b|[,.:]|$)/i.exec(text);
  return m ? m[1].trim() : null;
}

/** Text after "with", ":" etc. in "create a list with milk, bread" */
export function extractItemsText(text: string): string {
  let t = stripBudget(text);
  t = t.replace(/(?:called|named|name it|call it|titled)\s+["“']?[^"”',.:]+?["”']?(?=\s+(?:with|for|containing|that has)\b|[,.:]|$)/i, ' ');
  const m = /(?:\bwith\b|\bcontaining\b|\bthat has\b|\bfor\b|:)\s*([\s\S]+)$/i.exec(t);
  if (m) return m[1];
  return t.replace(/^.*?\b(?:create|make|new|start|build)\b\s+(?:a\s+|my\s+|new\s+)*(?:grocery\s+|shopping\s+)?list\b/i, '').replace(/^\s*(?:i need|get me|buy|add|order)\b/i, '');
}

export interface EditOps {
  add: ItemSpec[];
  remove: string[];
  setQuantity: Array<{ item: string; quantity: number }>;
  rename: string | null;
  budget: number | null | undefined;
}

const LIST_SUFFIX = /\s+(?:to|in|into|on|from|of)\s+(?:my\s+|the\s+)?(?:l\d{1,2}|list|["“'][^"”']+["”'])(?:\s+list)?\s*$/i;

export function parseEdit(text: string, listNames: Array<{ badge: string; name: string }>): EditOps {
  const ops: EditOps = { add: [], remove: [], setQuantity: [], rename: null, budget: undefined };
  const renameM = /\brename\b(?:\s+(?:it|this|the list|list|l\d{1,2}|["“'][^"”']+["”']))?\s+(?:to|as)\s+["“']?([^"”']+?)["”']?\s*$/i.exec(text);
  let body = text;
  if (renameM) {
    ops.rename = renameM[1].trim();
    body = text.slice(0, renameM.index);
  }
  const clearBudget = /\b(?:clear|remove|delete|drop|no)\s+(?:the\s+)?budget\b(?:\s+(?:from|for|on)\s+\S+)?/i;
  if (clearBudget.test(body)) {
    ops.budget = null;
    body = body.replace(clearBudget, ' ');
  }
  else if (/budget|under|below|limit|cap/i.test(body)) {
    const b = parseBudget(body);
    if (b) ops.budget = b;
  }
  body = body.replace(/\b(?:set|change|update|make)?\s*(?:the\s+)?budget\b[^,;]*/i, ' ');
  body = stripBudget(body);
  // Remove list names so "weekly staples" is not parsed as an item.
  for (const l of listNames) body = body.replace(new RegExp(`(?:to|in|into|on|from|of)\\s+(?:my\\s+|the\\s+)?${l.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s+list)?`, 'ig'), ' ');

  const clauses = body.split(/[,;]|\bthen\b|\band\b(?=\s+(?:add|remove|drop|delete|take|make|set|change|increase|decrease|update|put|include)\b)/i);
  let mode: 'add' | 'remove' | null = null;
  for (let c of clauses) {
    c = c.trim().replace(/\s+(?:and|then|also)$/i, '').replace(LIST_SUFFIX, '').trim();
    if (!c) continue;
    let m;
    if ((m = /^(?:please\s+)?(?:add|include|put|throw in|also add)\s+(.+)$/i.exec(c))) {
      mode = 'add';
      for (const p of splitItems(m[1].replace(LIST_SUFFIX, ''))) {
        const it = parseItemPhrase(p);
        if (it) ops.add.push(it);
      }
    } else if ((m = /^(?:please\s+)?(?:remove|drop|delete|take out|take off|no more)\s+(.+)$/i.exec(c))) {
      mode = 'remove';
      for (const p of splitItems(m[1].replace(LIST_SUFFIX, ''))) {
        const ref = p.replace(/^(?:the|all)\s+/i, '').trim();
        if (ref && !/^l\d+$/i.test(ref)) ops.remove.push(ref);
      }
    } else if ((m = /^(?:make|set|change|update|increase|decrease|reduce)\s+(?:the\s+)?(.+?)\s+(?:to\s+|qty\s+|quantity\s+)?(\d{1,2})(?:\s*(?:x|units?|packs?|qty))?$/i.exec(c))) {
      mode = null;
      ops.setQuantity.push({ item: m[1].replace(/\s+(?:quantity|qty)$/i, '').trim(), quantity: Number(m[2]) });
    } else if ((m = /^(\d{1,2})\s+(.+?)\s+instead$/i.exec(c))) {
      ops.setQuantity.push({ item: m[2], quantity: Number(m[1]) });
    } else if (mode) {
      // continuation of a previous "add x, y" / "remove x, y"
      if (mode === 'add') {
        const it = parseItemPhrase(c);
        if (it) ops.add.push(it);
      } else ops.remove.push(c);
    }
  }
  return ops;
}
