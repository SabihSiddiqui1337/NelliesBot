import type { Product } from '../nellis/types.ts';
import { productUrl } from '../nellis/types.ts';
import { assessCondition, type ConditionVerdict } from './condition.ts';
import { estimateResale, FBMP_SWEET_SPOT } from './resale.ts';
import { assessLiquidity } from './liquidity.ts';
import { evaluate, type Economics, type CostModel, HOUSTON_FBMP } from '../economics/cost.ts';

export interface ScoringConfig {
  /** Ignore lots whose suggested retail is below this. Most of the catalog is. */
  minRetailPrice: number;
  /** Profit target as a multiple of out-of-pocket. 2 = sell for 3x cost. */
  targetMargin: number;
  /** Don't bother below this absolute profit, whatever the ratio says. */
  minProfit: number;
  /** Suppress alerts built on guesswork. */
  minConfidence: number;
  costModel: CostModel;
}

export const DEFAULT_SCORING: ScoringConfig = {
  minRetailPrice: 80,
  targetMargin: 2,
  minProfit: 30,
  minConfidence: 0.6,
  costModel: HOUSTON_FBMP,
};

export interface Candidate {
  product: Product;
  url: string;
  economics: Economics;
  resale: { price: number; confidence: number; basis: string };
  condition: { verdict: ConditionVerdict; reasons: string[] };
  /** Why the resale estimate was discounted, if it was. */
  liquidityNotes: string[];
  demandScore: number;
  /** Ranking key: expected profit tempered by how much we trust the estimate. */
  rank: number;
  closesAt: Date;
  minutesRemaining: number;
}

/**
 * Demand proxy built only from signals already in the payload — no paid API.
 *
 * The honest caveat: this measures *plausibility*, not verified demand. The
 * genuinely reliable version comes from `settle`, which records what lots
 * actually close for and turns this guess into a measurement over a few weeks.
 */
function demandScore(p: Product, resalePrice: number): number {
  let s = 0.5;

  // Local buyers cluster in a price band; outside it, listings sit unsold.
  if (resalePrice >= FBMP_SWEET_SPOT.low && resalePrice <= FBMP_SWEET_SPOT.high) s += 0.2;
  else if (resalePrice < FBMP_SWEET_SPOT.low) s -= 0.25;
  else s -= 0.1; // high-ticket sells locally, just slowly

  // A recognisable brand carries itself in a local listing. "Generic" does not.
  const title = p.title.toLowerCase();
  if (/\b(generic|unbranded|uxcell|assorted)\b/.test(title)) s -= 0.2;

  // Nellis's own crowd is a signal: bidders competing early found something.
  // But it cuts both ways — a crowded lot has less room left for us.
  if (p.bidCount >= 15) s -= 0.1;
  else if (p.bidCount >= 3) s += 0.1;

  return Math.max(0, Math.min(1, Math.round(s * 100) / 100));
}

/** Scores one lot. Returns null when it fails a hard screen. */
export function scoreProduct(
  p: Product,
  cfg: ScoringConfig = DEFAULT_SCORING,
  category?: string,
): Candidate | null {
  if (p.isClosed) return null;
  if (!p.retailPrice || p.retailPrice < cfg.minRetailPrice) return null;

  const condition = assessCondition(p);
  if (condition.verdict === 'reject') return null;

  const raw = estimateResale({
    retailPrice: p.retailPrice,
    recoveryRatio: condition.recoveryRatio,
    category,
  });

  // Discount things that price well but sell badly locally — spare parts,
  // stock-photo listings, unpriceable titles. Without this the shortlist fills
  // up with pool equipment nobody within driving distance wants.
  const liquidity = assessLiquidity(p.title);
  const resale = {
    price: Math.round(raw.price * liquidity.factor * 100) / 100,
    confidence: Math.round(raw.confidence * liquidity.confidencePenalty * 100) / 100,
    basis: liquidity.reasons.length
      ? `${raw.basis}; discounted: ${liquidity.reasons.join('; ')}`
      : raw.basis,
  };

  const economics = evaluate(p.currentPrice, resale.price, cfg.targetMargin, cfg.costModel);
  if (!economics.worthBidding) return null;
  if (economics.profitAtCurrentBid < cfg.minProfit) return null;
  if (resale.confidence < cfg.minConfidence) return null;

  const demand = demandScore(p, resale.price);
  const closesAt = new Date(p.closeTime);
  const minutesRemaining = Math.round((closesAt.getTime() - Date.now()) / 60000);

  return {
    product: p,
    url: productUrl(p),
    economics,
    resale,
    condition: { verdict: condition.verdict, reasons: condition.reasons },
    liquidityNotes: liquidity.reasons,
    demandScore: demand,
    // Weighting profit by confidence and demand keeps a $900 "profit" built on
    // a garbage retail anchor from outranking a solid $80 one.
    rank: Math.round(economics.profitAtCurrentBid * resale.confidence * demand * 100) / 100,
    closesAt,
    minutesRemaining,
  };
}

export function rankCandidates(cands: Candidate[]): Candidate[] {
  return [...cands].sort((a, b) => b.rank - a.rank);
}
