/**
 * Estimates what a lot realistically sells for on Facebook Marketplace locally.
 *
 * THIS IS THE WEAKEST LINK IN THE WHOLE PIPELINE and it is deliberately
 * isolated here so it can be replaced. FBMP publishes no sold-comps API, so v1
 * derives a local price from Nellis's own suggested retail, discounted by
 * condition and by how well the category moves locally. Every number below is
 * a starting estimate, not a measured one.
 *
 * The replacement path is `store/comps.ts`: the bot records what lots actually
 * close for at Nellis and, once enough history exists, learns real recovery
 * ratios per category instead of guessing them.
 */

/**
 * How well a category sells locally on FBMP, relative to a baseline.
 *
 * Note the shape of this table: bulky goods score ABOVE 1. On eBay they are
 * penalised because shipping destroys the margin, so other resellers avoid
 * them and they go cheap at auction. On local pickup that is pure upside.
 * Small commodity goods score below 1 — they are cheap new online, so a local
 * buyer has no reason to drive to you.
 */
export const CATEGORY_LOCAL_DEMAND: Record<string, number> = {
  'Furniture & Appliances': 1.15,
  'Home Improvement': 1.1,
  'Outdoors & Sports': 1.1,
  'Patio & Garden': 1.1,
  Baby: 1.05,
  Automotive: 0.95,
  Electronics: 0.95,
  'Pet Supplies': 0.85,
  'Home & Household Essentials': 0.85,
  'Bulk and Mixed Items': 0.8,
  'Smart Home': 0.8,
  'Toys & Games': 0.8,
  'Office & School Supplies': 0.7,
  'Beauty & Personal Care': 0.6,
  'Clothing, Shoes & Accessories': 0.5,
  'Books, Music & Media': 0.4,
  'Food, Supplements & Pantry': 0.4,
};

export const DEFAULT_CATEGORY_DEMAND = 0.8;

/** FBMP local buyers cluster here. Outside it, listings sit. */
export const FBMP_SWEET_SPOT = { low: 40, high: 400 };

export interface ResaleEstimate {
  price: number;
  /** 0-1. How much to trust `price`. Low confidence should suppress alerts. */
  confidence: number;
  basis: string;
}

export function estimateResale(args: {
  retailPrice: number;
  recoveryRatio: number;
  category?: string | undefined;
}): ResaleEstimate {
  const categoryFactor = args.category
    ? CATEGORY_LOCAL_DEMAND[args.category] ?? DEFAULT_CATEGORY_DEMAND
    : DEFAULT_CATEGORY_DEMAND;

  const price = args.retailPrice * args.recoveryRatio * categoryFactor;

  // Confidence is about the ESTIMATE, not the deal. A $9.99-retail item has a
  // meaningless retail anchor; an uncategorised one has no local signal.
  let confidence = 0.5;
  if (args.retailPrice >= 80) confidence += 0.15;
  if (args.retailPrice >= 200) confidence += 0.1;
  if (args.category) confidence += 0.15;
  if (price >= FBMP_SWEET_SPOT.low && price <= FBMP_SWEET_SPOT.high) confidence += 0.1;
  confidence = Math.min(1, confidence);

  return {
    price: Math.round(price * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    basis: `retail $${args.retailPrice.toFixed(2)} x ${args.recoveryRatio.toFixed(2)} condition x ${categoryFactor.toFixed(2)} local demand (estimated, not measured)`,
  };
}
