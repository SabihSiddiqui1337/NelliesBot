/** Shapes returned by Nellis Auction's Remix route loaders. See docs/RECON.md. */

export interface GradeDescriptor {
  id: number;
  description: string;
}

/**
 * Condition breakdown. `rating` is near-useless on its own — ~89% of Houston
 * inventory is 5-star — so screening leans on the sub-fields instead.
 */
export interface Grade {
  rating: number;
  conditionType: GradeDescriptor | null;   // "New" | "Used"
  damageType: GradeDescriptor | null;      // "None" | "Minor" | "Major"
  missingPartsType: GradeDescriptor | null;
  functionalType: GradeDescriptor | null;
  packageType: GradeDescriptor | null;
  assemblyType: GradeDescriptor | null;
  categoryType: GradeDescriptor | null;
}

export interface NellisLocation {
  id: number;
  name: string;      // "SW Houston" | "Katy"
  address: string;
  city: string;
  state: string;
  zipCode: number;
  timezone: string;
  offsite: boolean;
}

export interface Photo {
  url: string;
  name: string;
  fullPath: string;
}

export interface Product {
  id: number;
  inventoryNumber: string;
  title: string;
  retailPrice: number;
  currentPrice: number;
  bidCount: number;
  openTime: string;
  closeTime: string;
  initialCloseTime: string;
  /** Seconds a bid inside the closing window pushes the close out. Observed: 30. */
  extensionInterval: number;
  projectExtended: boolean;
  isClosed: boolean;
  marketStatus: string;
  notReturnable: boolean;
  notes: string | null;
  location: NellisLocation;
  photos: Photo[];
  grade: Grade | null;
}

export interface SearchResponse {
  products: Product[];
  currentShoppingLocation: { id: number; name: string };
  facets: Record<string, Record<string, number>>;
  searchResultsCount: number;
  algolia: {
    nbHits: number;
    nbPages: number;
    page: number;
    hitsPerPage: number;
    indexUsed: string;
    query: string;
  };
}

/** Canonical product URL. The slug is cosmetic; the id is what resolves. */
export function productUrl(p: Product): string {
  const slug = p.title
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `https://www.nellisauction.com/p/${slug}/${p.id}`;
}
