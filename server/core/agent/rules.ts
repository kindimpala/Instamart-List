/**
 * Deterministic intent router used when ANTHROPIC_API_KEY is not set (offline
 * demo / tests) and as a fallback if the model call fails. Calls the same tools.
 */
import { getLists } from '../lists.js';
import { extractItemsText, extractListName, findListRef, parseBudget, parseEdit, parseItemPhrase, splitItems, stripBudget } from './parse.js';
import { toolImpls, type ToolEnv } from './tools.js';

const HELP =
  'I can create lists (“Create a list with milk, bread and 6 eggs”), edit them (“Add 1 kg onions to L1, remove eggs”), show them, and order a list (“Order L1 under ₹300”). Nothing is ordered until you tap Confirm order.';

export async function runRulesAgent(env: ToolEnv, message: string): Promise<string> {
  const text = message.trim();
  const lower = text.toLowerCase();
  const lists = await getLists(env.ctx.storage, env.ctx.uid);
  const names = lists.map((l) => ({ badge: l.badge, name: l.name }));
  const listRef = findListRef(text, names);
  const budget = parseBudget(text);

  if (/^(hi|hello|hey|namaste|help|what can you do)\b/.test(lower)) return `Hi! ${HELP}`;

  if (/\b(show|view|see|open|display)\b.*\blists?\b|^my lists$|\bwhat lists\b|^lists?$/.test(lower)) {
    await toolImpls.get_lists(env);
    return lists.length ? 'Here are your lists.' : 'You don’t have any lists yet.';
  }

  const deleteTarget = lower
    .replace(/\b(please|pls|can you|could you|delete|remove|discard|the|my|this|whole|entire|list)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .trim();
  const listName = listRef ? lists.find((l) => l.badge === listRef || l.name === listRef)?.name.toLowerCase() ?? '' : '';
  if (/^(?:please\s+)?(delete|remove|discard)\b/.test(lower) && listRef && (deleteTarget === listRef.toLowerCase() || deleteTarget === listName)) {
    await toolImpls.delete_list(env, { list: listRef });
    return 'Please confirm below.';
  }

  if (/\b(order|reorder|re-order|buy|checkout|place)\b/.test(lower)) {
    if (listRef) {
      await toolImpls.prepare_order(env, { list: listRef, budget });
      return 'Here’s your bill. Review it and tap Confirm order when you’re ready.';
    }
    const itemsText = stripBudget(text).replace(/^.*?\b(?:order|buy|reorder|re-order)\b\s*(?:me\s+)?/i, '');
    const items = splitItems(itemsText).map(parseItemPhrase).filter(Boolean) as NonNullable<ReturnType<typeof parseItemPhrase>>[];
    if (items.length && !/^(a |my |the )?lists?$/i.test(itemsText.trim())) {
      const r = await toolImpls.draft_list(env, { items, budget });
      if (r.items.length) {
        env.cards.length = 0; // show the bill directly for one-off orders
        await toolImpls.prepare_order(env, { draft_id: r.draft_id, budget });
        return 'I added those to your cart. Review the bill and tap Confirm order when you’re ready.';
      }
      return 'I couldn’t find those items. Try different names?';
    }
    await toolImpls.get_lists(env);
    return lists.length ? 'Which list should I order? Tap “Order this list” on one below.' : 'You don’t have any lists yet. Tell me what you need and I’ll make one.';
  }

  const editVerb = /\b(add|include|remove|drop|take out|make|set|change|increase|decrease|rename|update|budget)\b/.test(lower);
  if (listRef && editVerb) {
    const ops = parseEdit(text, names);
    await toolImpls.edit_list(env, {
      list: listRef,
      add: ops.add,
      remove: ops.remove,
      set_quantity: ops.setQuantity,
      rename: ops.rename ?? undefined,
      budget: ops.budget,
    });
    return 'Here’s what will change. Tap Apply changes to save.';
  }

  if (/\b(create|make|new|start|build|plan)\b.*\blist\b|^list:|\bi need\b|\bget me\b/.test(lower) || (!listRef && splitItems(text).length > 1)) {
    const name = extractListName(text);
    const items = splitItems(extractItemsText(text)).map(parseItemPhrase).filter(Boolean) as NonNullable<ReturnType<typeof parseItemPhrase>>[];
    if (!items.length) return 'What should go on the list? For example: “milk, bread, 6 eggs and 1 kg atta”.';
    await toolImpls.draft_list(env, { name: name ?? undefined, items, budget });
    return budget ? `Found these for you. I’ve checked them against your ₹${budget} budget.` : 'Found these for you.';
  }

  if (/\bbudget\b/.test(lower) && budget && listRef) {
    await toolImpls.edit_list(env, { list: listRef, budget });
    return 'Here’s the budget change. Tap Apply changes to save.';
  }

  return HELP;
}
