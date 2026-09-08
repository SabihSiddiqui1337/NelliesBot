import { DEFAULT_SCORING, type ScoringConfig } from './scoring/score.ts';

/** Nellis shopping location ids. Houston covers SW Houston + Katy. */
export const SHOPPING_LOCATIONS = {
  LAS_VEGAS: 1, PHOENIX: 2, HOUSTON: 5, PHILADELPHIA: 6, DENVER: 7, DALLAS: 8,
} as const;

/**
 * Taxonomy Level 1 values, used both as a scan partition and as the category
 * label for scoring. Partitioning by category is what keeps each slice small
 * enough to page through — walking all ~32.8k Houston lots is not viable.
 */
export const CATEGORIES = [
  'Furniture & Appliances', 'Home Improvement', 'Outdoors & Sports',
  'Patio & Garden', 'Baby', 'Electronics', 'Automotive', 'Smart Home',
  'Home & Household Essentials', 'Pet Supplies', 'Toys & Games',
  'Office & School Supplies', 'Bulk and Mixed Items', 'Beauty & Personal Care',
  'Clothing, Shoes & Accessories', 'Books, Music & Media',
  'Food, Supplements & Pantry',
] as const;

export interface AppConfig {
  webhookUrl: string;
  shoppingLocationId: number;
  warehouses: string[];
  scoring: ScoringConfig;
  maxAlerts: number;
  pagesPerCategory: number;
  dbPath: string;
}

export function loadConfig(): AppConfig {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL ?? '';
  if (!webhookUrl) {
    throw new Error(
      'DISCORD_WEBHOOK_URL is not set. Copy .env.example to .env and fill it in, ' +
        'then run via the npm scripts (they pass --env-file=.env).',
    );
  }
  return {
    webhookUrl,
    shoppingLocationId: Number(process.env.NELLIS_SHOPPING_LOCATION_ID ?? SHOPPING_LOCATIONS.HOUSTON),
    warehouses: (process.env.NELLIS_WAREHOUSES ?? 'SW Houston,Katy').split(',').map((s) => s.trim()),
    scoring: {
      ...DEFAULT_SCORING,
      minRetailPrice: Number(process.env.MIN_RETAIL_PRICE ?? DEFAULT_SCORING.minRetailPrice),
      targetMargin: Number(process.env.TARGET_MARGIN ?? DEFAULT_SCORING.targetMargin),
      minProfit: Number(process.env.MIN_PROFIT ?? DEFAULT_SCORING.minProfit),
    },
    maxAlerts: Number(process.env.MAX_ALERTS ?? 20),
    pagesPerCategory: Number(process.env.PAGES_PER_CATEGORY ?? 3),
    dbPath: process.env.DB_PATH ?? 'data/nellies.db',
  };
}
