/** Picks the best variant for a requested item from search_products results. */
import type { Alternative, DraftItem } from '../../shared/cards.js';
import type { SearchData, SearchProduct, Variation } from '../../shared/instamart.js';
import { sizeDistance } from '../../shared/sizes.js';

export interface ItemRequest {
  query: string;
  quantity: number;
  size?: string | null;
  maxPrice?: number | null;
  spinId?: string | null;
}

const toAlt = (p: SearchProduct, v: Variation): Alternative => ({
  spinId: v.spinId,
  productId: p.productId,
  name: p.displayName,
  size: v.quantityDescription,
  price: v.price.offerPrice,
  inStock: v.isInStockAndAvailable,
});

export function allVariants(data: SearchData): Array<{ p: SearchProduct; v: Variation; rank: number }> {
  const out: Array<{ p: SearchProduct; v: Variation; rank: number }> = [];
  [...data.products, ...(data.similarProducts ?? [])].forEach((p, rank) => p.variations.forEach((v) => out.push({ p, v, rank })));
  return out;
}

export function pickVariant(data: SearchData, req: ItemRequest): DraftItem | null {
  const all = allVariants(data);
  if (!all.length) return null;
  let chosen = req.spinId ? all.find((x) => x.v.spinId === req.spinId) : undefined;
  if (!chosen) {
    const inStock = all.filter((x) => x.v.isInStockAndAvailable);
    const pool = (inStock.length ? inStock : all).filter((x) => x.rank <= 2);
    const priced = req.maxPrice ? pool.filter((x) => x.v.price.offerPrice <= req.maxPrice!) : pool;
    const candidates = priced.length ? priced : pool;
    candidates.sort((a, b) => {
      if (req.size) {
        const d = sizeDistance(req.size, a.v.quantityDescription) - sizeDistance(req.size, b.v.quantityDescription);
        if (Number.isFinite(d) && d !== 0) return d;
        if (!Number.isFinite(d)) {
          const fa = Number.isFinite(sizeDistance(req.size, a.v.quantityDescription));
          const fb = Number.isFinite(sizeDistance(req.size, b.v.quantityDescription));
          if (fa !== fb) return fa ? -1 : 1;
        }
      }
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.v.price.offerPrice - b.v.price.offerPrice;
    });
    chosen = candidates[0];
  }
  const alternatives = all
    .filter((x) => x.v.spinId !== chosen!.v.spinId)
    .sort((a, b) => Number(b.v.isInStockAndAvailable) - Number(a.v.isInStockAndAvailable) || Number(a.p.productId !== chosen!.p.productId) - Number(b.p.productId !== chosen!.p.productId) || a.rank - b.rank)
    .slice(0, 3)
    .map((x) => toAlt(x.p, x.v));
  return {
    query: req.query,
    spinId: chosen.v.spinId,
    productId: chosen.p.productId,
    name: chosen.p.displayName,
    size: chosen.v.quantityDescription,
    price: chosen.v.price.offerPrice,
    quantity: Math.max(1, Math.min(20, Math.round(req.quantity || 1))),
    inStock: chosen.v.isInStockAndAvailable,
    alternatives,
  };
}

/** Closest in-stock replacement for an unavailable variant: same product first, then similar products. */
export function findSubstitute(data: SearchData, original: { spinId: string; productId: string; size: string; price: number }): Alternative | null {
  const pool = allVariants(data).filter((x) => x.v.isInStockAndAvailable && x.v.spinId !== original.spinId);
  if (!pool.length) return null;
  // Score: size closeness (log ratio) + small penalty for switching product + relevance rank.
  const score = (x: (typeof pool)[number]) => {
    const d = sizeDistance(original.size, x.v.quantityDescription);
    return (Number.isFinite(d) ? d : 3) + (x.p.productId === original.productId ? 0 : 0.5) + x.rank * 0.2;
  };
  pool.sort((a, b) => score(a) - score(b) || Math.abs(a.v.price.offerPrice - original.price) - Math.abs(b.v.price.offerPrice - original.price));
  return toAlt(pool[0].p, pool[0].v);
}

/** Cheaper in-stock options for budget suggestions. */
export function cheaperOptions(data: SearchData, current: { spinId: string; price: number }): Alternative[] {
  return allVariants(data)
    .filter((x) => x.v.isInStockAndAvailable && x.v.spinId !== current.spinId && x.v.price.offerPrice < current.price && x.rank <= 2)
    .sort((a, b) => a.v.price.offerPrice - b.v.price.offerPrice)
    .slice(0, 3)
    .map((x) => toAlt(x.p, x.v));
}
