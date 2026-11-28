/** Budget maths shared by server (order preview) and client (draft editing). */
import type { Alternative, BudgetStatus, BudgetSuggestion } from './cards.js';

export interface BudgetLine {
  spinId: string;
  name: string;
  size: string;
  price: number; // unit price
  quantity: number;
  alternatives?: Alternative[];
}

export function computeBudget(limit: number, total: number, lines: BudgetLine[], basis: BudgetStatus['basis']): BudgetStatus {
  const over = total > limit;
  const suggestions: BudgetSuggestion[] = [];
  if (over) {
    let gap = total - limit;
    const cheaper: BudgetSuggestion[] = [];
    for (const l of lines) {
      const best = (l.alternatives ?? [])
        .filter((a) => a.inStock && a.price < l.price && a.spinId !== l.spinId)
        .sort((a, b) => a.price - b.price)[0];
      if (best) {
        cheaper.push({
          kind: 'cheaper',
          fromSpinId: l.spinId,
          toSpinId: best.spinId,
          name: l.name,
          fromLabel: `${l.size}`,
          toLabel: best.name === l.name ? best.size : `${best.name} ${best.size}`,
          saving: Math.round((l.price - best.price) * l.quantity * 100) / 100,
        });
      }
    }
    cheaper.sort((a, b) => b.saving - a.saving);
    for (const s of cheaper) {
      suggestions.push(s);
      gap -= s.saving;
      if (gap <= 0 || suggestions.length >= 3) break;
    }
    if (gap > 0) {
      const removable = [...lines].sort((a, b) => b.price * b.quantity - a.price * a.quantity);
      for (const l of removable) {
        if (suggestions.some((s) => s.kind === 'cheaper' && s.fromSpinId === l.spinId)) continue;
        suggestions.push({ kind: 'remove', spinId: l.spinId, name: `${l.name} ${l.size}`, saving: l.price * l.quantity });
        gap -= l.price * l.quantity;
        if (gap <= 0 || suggestions.length >= 4) break;
      }
    }
  }
  return {
    limit,
    total: Math.round(total * 100) / 100,
    basis,
    over,
    remaining: Math.round((limit - total) * 100) / 100,
    suggestions,
  };
}
