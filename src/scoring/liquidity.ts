/**
 * Penalises lots that look valuable on paper but move badly on a local
 * marketplace.
 *
 * This exists because of what the first live scan actually returned. Ranked by
 * raw estimated profit, the top of the list was salt chlorine generators, D.E.
 * filter tank lids, pump circuit boards, a pool liner and assorted "fits
 * Pentair/Hayward" spares. Every one has a high suggested retail and a rock
 * bottom bid — and every one is nearly unsellable on Facebook Marketplace,
 * because the buyer pool is the handful of people in Houston who own that exact
 * system and need that exact part this week.
 *
 * High retail with no bidders is usually the auction telling you something.
 */

/** Component or spare part rather than a finished product. */
const PARTS_PATTERNS: RegExp[] = [
  /\breplacement\b/i,
  /\bcompatible (with|for)\b/i,
  /\bfits\b/i,
  /\bfor [A-Z][a-zA-Z]+ (V?\d|[A-Z]{2,}\d)/,
  /\b(cartridge|circuit board|pcb|gasket|o-?ring|impeller|shaft|bearing|valve|actuator|solenoid)\b/i,
  /\b(tank lid|lid assembly|filter assembly|motor assembly)\b/i,
  /\b(salt cell|chlorine generator|d\.?e\.? filter|skimmer|pool liner|overlap liner)\b/i,
  /\bmodel\s*#?\s*[A-Z0-9-]{4,}\b/i,
];

/** The listing itself signals the photo is not the actual item. */
const STOCK_PHOTO_PATTERNS: RegExp[] = [
  /similar item in stock photo/i,
  /see live photo/i,
  /stock photo/i,
];

/** Titles too vague to price. */
const VAGUE_PATTERNS: RegExp[] = [
  /^.{0,14}$/,                    // a handful of characters is not a description
  /\b(assorted|misc|miscellaneous|bundle of|lot of)\b/i,
];

export interface LiquidityAssessment {
  /** Multiplier on the resale estimate, 0-1. */
  factor: number;
  /** Multiplier on estimate confidence, 0-1. */
  confidencePenalty: number;
  reasons: string[];
}

export function assessLiquidity(title: string): LiquidityAssessment {
  const reasons: string[] = [];
  let factor = 1;
  let confidencePenalty = 1;

  if (PARTS_PATTERNS.some((re) => re.test(title))) {
    factor *= 0.35;
    confidencePenalty *= 0.6;
    reasons.push('spare part / compatibility item — thin local buyer pool');
  }

  if (STOCK_PHOTO_PATTERNS.some((re) => re.test(title))) {
    factor *= 0.7;
    confidencePenalty *= 0.5;
    reasons.push('listing says the photo is not the actual item');
  }

  if (VAGUE_PATTERNS.some((re) => re.test(title.trim()))) {
    factor *= 0.6;
    confidencePenalty *= 0.5;
    reasons.push('title too vague to price');
  }

  return { factor, confidencePenalty, reasons };
}
