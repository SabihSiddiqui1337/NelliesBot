import type { Product } from '../nellis/types.ts';

export type ConditionVerdict = 'clean' | 'flag' | 'reject';

export interface ConditionAssessment {
  verdict: ConditionVerdict;
  /** Multiplier applied to the resale estimate. */
  recoveryRatio: number;
  reasons: string[];
}

/**
 * Screens a lot on its structured condition fields.
 *
 * `grade.rating` is deliberately ignored as a primary signal: ~89% of Houston
 * inventory is 5-star, so it separates almost nothing. The sub-fields do the
 * real work.
 *
 * Broken items are NOT dropped outright. A damaged lot whose photos look fine
 * is exactly the case worth a human glance, so it comes back as 'flag' and is
 * surfaced in a separate section of the digest for manual verification.
 */
export function assessCondition(p: Product): ConditionAssessment {
  const g = p.grade;
  const reasons: string[] = [];

  if (!g) {
    return { verdict: 'flag', recoveryRatio: 0.2, reasons: ['no condition data'] };
  }

  const isNew = g.conditionType?.description === 'New';
  const damage = g.damageType?.description ?? 'None';
  const missingParts = g.missingPartsType?.description === 'Yes';
  const nonFunctional = g.functionalType?.description === 'No';
  const packaged = g.packageType?.description === 'Yes';

  let ratio = isNew ? 0.4 : 0.3;
  if (isNew && packaged) ratio = 0.45;
  if (isNew) reasons.push('listed New');

  let verdict: ConditionVerdict = 'clean';

  if (nonFunctional) {
    reasons.push('marked NOT FUNCTIONAL');
    ratio = Math.min(ratio, 0.1);
    verdict = 'flag';
  }
  if (missingParts) {
    reasons.push('missing parts');
    ratio = Math.min(ratio, 0.15);
    verdict = 'flag';
  }
  if (damage === 'Major') {
    reasons.push('major damage');
    ratio = Math.min(ratio, 0.12);
    verdict = 'flag';
  } else if (damage === 'Minor') {
    reasons.push('minor damage');
    ratio *= 0.7;
  }

  // Nothing salvageable and nothing to look at: not worth a human's attention.
  if (nonFunctional && missingParts && damage === 'Major') {
    verdict = 'reject';
    reasons.push('non-functional, incomplete and badly damaged');
  }

  return { verdict, recoveryRatio: ratio, reasons };
}
