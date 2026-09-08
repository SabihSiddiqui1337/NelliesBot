import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Product } from '../nellis/types.ts';

/**
 * Local history, using Node's built-in SQLite (no dependency).
 *
 * The point of this store is to retire the guesswork in `scoring/resale.ts`.
 * Every scan records the lots seen; `settle` records what they finally closed
 * for. After a few weeks that yields a measured answer to "what does a
 * KitchenAid mixer actually go for in Houston" — which is the demand signal
 * we would otherwise be paying an API for.
 */
export class Store {
  private db: DatabaseSync;

  constructor(path = 'data/nellies.db') {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS lots (
        product_id     INTEGER PRIMARY KEY,
        title          TEXT    NOT NULL,
        retail_price   REAL    NOT NULL,
        category       TEXT,
        warehouse      TEXT    NOT NULL,
        close_time     TEXT    NOT NULL,
        first_seen     TEXT    NOT NULL,
        last_seen      TEXT    NOT NULL,
        last_price     REAL    NOT NULL,
        last_bid_count INTEGER NOT NULL,
        final_price    REAL,
        settled_at     TEXT
      );

      CREATE TABLE IF NOT EXISTS observations (
        product_id  INTEGER NOT NULL,
        observed_at TEXT    NOT NULL,
        price       REAL    NOT NULL,
        bid_count   INTEGER NOT NULL,
        PRIMARY KEY (product_id, observed_at)
      );

      CREATE INDEX IF NOT EXISTS idx_lots_close   ON lots (close_time);
      CREATE INDEX IF NOT EXISTS idx_lots_settled ON lots (settled_at);
    `);
  }

  recordSighting(p: Product, category?: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO lots (product_id, title, retail_price, category, warehouse,
                           close_time, first_seen, last_seen, last_price, last_bid_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(product_id) DO UPDATE SET
           last_seen      = excluded.last_seen,
           last_price     = excluded.last_price,
           last_bid_count = excluded.last_bid_count,
           close_time     = excluded.close_time`,
      )
      .run(
        p.id, p.title, p.retailPrice, category ?? null, p.location?.name ?? 'unknown',
        p.closeTime, now, now, p.currentPrice, p.bidCount,
      );

    this.db
      .prepare(
        `INSERT OR REPLACE INTO observations (product_id, observed_at, price, bid_count)
         VALUES (?, ?, ?, ?)`,
      )
      .run(p.id, now, p.currentPrice, p.bidCount);
  }

  /** Lots past their close time that have not had a final price recorded yet. */
  unsettled(limit = 500): { product_id: number }[] {
    return this.db
      .prepare(
        `SELECT product_id FROM lots
          WHERE settled_at IS NULL AND close_time < ?
          ORDER BY close_time DESC LIMIT ?`,
      )
      .all(new Date().toISOString(), limit) as { product_id: number }[];
  }

  settle(productId: number, finalPrice: number): void {
    this.db
      .prepare(`UPDATE lots SET final_price = ?, settled_at = ? WHERE product_id = ?`)
      .run(finalPrice, new Date().toISOString(), productId);
  }

  /**
   * Measured close-price-to-retail ratio per category. This is the number that
   * eventually replaces the estimated recovery ratios in scoring/resale.ts.
   */
  learnedRecovery(minSamples = 30): Map<string, { ratio: number; samples: number }> {
    const rows = this.db
      .prepare(
        `SELECT category, COUNT(*) AS samples, AVG(final_price / retail_price) AS ratio
           FROM lots
          WHERE settled_at IS NOT NULL AND retail_price > 0 AND final_price IS NOT NULL
          GROUP BY category
         HAVING COUNT(*) >= ?`,
      )
      .all(minSamples) as { category: string | null; samples: number; ratio: number }[];

    return new Map(
      rows
        .filter((r) => r.category)
        .map((r) => [r.category as string, { ratio: r.ratio, samples: r.samples }]),
    );
  }

  stats(): { lots: number; settled: number; observations: number } {
    const one = (sql: string) => (this.db.prepare(sql).get() as { n: number }).n;
    return {
      lots: one('SELECT COUNT(*) AS n FROM lots'),
      settled: one('SELECT COUNT(*) AS n FROM lots WHERE settled_at IS NOT NULL'),
      observations: one('SELECT COUNT(*) AS n FROM observations'),
    };
  }

  close(): void {
    this.db.close();
  }
}
