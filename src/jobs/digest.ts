import { NellisClient } from '../nellis/client.ts';
import { Store } from '../store/db.ts';
import { rankCandidates, scoreProduct, type Candidate } from '../scoring/score.ts';
import { CATEGORIES, type AppConfig } from '../config.ts';
import type { Product } from '../nellis/types.ts';

export interface ScanResult {
  scanned: number;
  candidates: Candidate[];
  perCategory: { category: string; seen: number; kept: number; reportedTotal: number }[];
}

/**
 * Scans Houston inventory category by category and scores what it finds.
 *
 * LIMITATION, by design in v1: this reads the first `pagesPerCategory` pages of
 * each category, not the entire catalog. With ~32.8k open Houston lots and
 * cumulative paging, exhaustive enumeration is neither cheap nor kind to their
 * servers. The default result order favours high-retail lots closing soonest,
 * which is the same slice we care about, but this IS a sample — a lot can be
 * missed. Widening it is a matter of raising pagesPerCategory.
 */
export async function scan(cfg: AppConfig, client: NellisClient, store?: Store): Promise<ScanResult> {
  const locationName = await client.setShoppingLocation(cfg.shoppingLocationId);
  console.log(`shopping location: ${locationName} (id ${cfg.shoppingLocationId})`);

  const wanted = new Set(cfg.warehouses);
  const candidates: Candidate[] = [];
  const perCategory: ScanResult['perCategory'] = [];
  let scanned = 0;

  for (const category of CATEGORIES) {
    let batch: { products: Product[]; reportedTotal: number };
    try {
      batch = await client.collect(
        { filters: { 'Taxonomy Level 1': category } },
        cfg.pagesPerCategory,
      );
    } catch (err) {
      console.warn(`  ${category}: FAILED — ${(err as Error).message}`);
      continue;
    }

    // Houston's session already restricts to SW Houston + Katy, but assert it
    // rather than assume: a silent location fallback would otherwise ship
    // Las Vegas lots you cannot possibly drive to.
    const local = batch.products.filter((p) => wanted.has(p.location?.name ?? ''));
    scanned += local.length;

    let kept = 0;
    for (const p of local) {
      store?.recordSighting(p, category);
      const c = scoreProduct(p, cfg.scoring, category);
      if (c) { candidates.push(c); kept++; }
    }

    perCategory.push({ category, seen: local.length, kept, reportedTotal: batch.reportedTotal });
    console.log(`  ${category.padEnd(32)} seen ${String(local.length).padStart(4)}  kept ${kept}`);
  }

  return { scanned, candidates: rankCandidates(candidates), perCategory };
}
