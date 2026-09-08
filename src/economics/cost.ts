/**
 * Buy-side and sell-side economics.
 *
 * Buy side (Nellis, Houston):
 *   hammer -> +15% buyer's premium -> +8.25% sales tax
 *
 * Sell side (Facebook Marketplace, local pickup):
 *   no seller fee. Local cash sales net the full sale price, which is why
 *   FBMP changes the calculus versus eBay's ~13% final value fee — and why
 *   bulky items, which other resellers avoid over shipping cost, are an
 *   advantage here rather than a liability.
 *
 * ASSUMPTION, still to verify against a real Nellis invoice: sales tax is
 * charged on hammer + premium, not on hammer alone. If it turns out to be
 * hammer-only, landed cost drops by ~1.2% and every max-bid gets slightly
 * more generous. Erring this way is the safe direction.
 */

export interface CostModel {
  buyersPremiumRate: number;
  salesTaxRate: number;
  /** Fraction of sale price lost to the selling platform. FBMP local = 0. */
  sellerFeeRate: number;
  /** Fixed per-item overhead: fuel, time, storage. Subtracted from profit. */
  handlingCost: number;
}

export const HOUSTON_FBMP: CostModel = {
  buyersPremiumRate: 0.15,
  salesTaxRate: 0.0825, // TX state 6.25% + Houston local 2.0%
  sellerFeeRate: 0,
  handlingCost: 5,
};

/** Total cash out of pocket to take a lot home at a given hammer price. */
export function landedCost(hammer: number, m: CostModel = HOUSTON_FBMP): number {
  return hammer * (1 + m.buyersPremiumRate) * (1 + m.salesTaxRate);
}

/** The multiplier from hammer price to out-of-pocket. Houston/FBMP: ~1.2449. */
export function landedMultiplier(m: CostModel = HOUSTON_FBMP): number {
  return (1 + m.buyersPremiumRate) * (1 + m.salesTaxRate);
}

/** What actually reaches your pocket from a sale. FBMP local: the full price. */
export function netProceeds(salePrice: number, m: CostModel = HOUSTON_FBMP): number {
  return salePrice * (1 - m.sellerFeeRate);
}

export function profitAt(hammer: number, salePrice: number, m: CostModel = HOUSTON_FBMP): number {
  return netProceeds(salePrice, m) - landedCost(hammer, m) - m.handlingCost;
}

/**
 * Highest hammer price that still clears `targetMargin` profit as a fraction of
 * landed cost. targetMargin 2 means "sell for 3x what it cost me".
 *
 * This is the number to actually bid to — it is bid discipline, not a
 * prediction. Returns 0 when no bid can clear the target, which is the common
 * case and should be treated as "skip", not "bid a dollar".
 */
export function maxBid(
  estimatedSalePrice: number,
  targetMargin: number,
  m: CostModel = HOUSTON_FBMP,
): number {
  const net = netProceeds(estimatedSalePrice, m) - m.handlingCost;
  if (net <= 0) return 0;
  const affordableLanded = net / (1 + targetMargin);
  const hammer = affordableLanded / landedMultiplier(m);
  return Math.max(0, Math.floor(hammer * 100) / 100);
}

export interface Economics {
  currentBid: number;
  landedAtCurrentBid: number;
  maxBid: number;
  estimatedSalePrice: number;
  profitAtCurrentBid: number;
  profitAtMaxBid: number;
  /** Profit as a fraction of out-of-pocket, at the current bid. */
  roiAtCurrentBid: number;
  /** Whether the lot is still under the disciplined max bid. */
  worthBidding: boolean;
}

export function evaluate(
  currentBid: number,
  estimatedSalePrice: number,
  targetMargin: number,
  m: CostModel = HOUSTON_FBMP,
): Economics {
  const landed = landedCost(currentBid, m);
  const cap = maxBid(estimatedSalePrice, targetMargin, m);
  const profitNow = profitAt(currentBid, estimatedSalePrice, m);
  return {
    currentBid,
    landedAtCurrentBid: round2(landed),
    maxBid: cap,
    estimatedSalePrice: round2(estimatedSalePrice),
    profitAtCurrentBid: round2(profitNow),
    profitAtMaxBid: round2(profitAt(cap, estimatedSalePrice, m)),
    roiAtCurrentBid: landed > 0 ? round2(profitNow / landed) : 0,
    worthBidding: cap > 0 && currentBid <= cap,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
