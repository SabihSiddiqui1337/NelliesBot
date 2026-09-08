import type { Product, SearchResponse } from './types.ts';

const BASE = 'https://www.nellisauction.com';
const MAX_RETRIES = 4;

/**
 * Nellis serves JSON straight out of its Remix route loaders, so no HTML
 * parsing or headless browser is needed. Two things make a naive client
 * silently wrong, and both are guarded here:
 *
 *  1. Shopping location is session state, not a URL parameter. An invalid id
 *     is accepted and silently falls back to the previous location, so the
 *     switch is always read back and asserted.
 *  2. `?page=N` is a no-op that returns HTTP 200 with page 1 every time. Real
 *     paging is `_p1=s:<offset>,n:<page>`.
 */
export class NellisClient {
  private cookies = new Map<string, string>();
  private lastRequest = 0;

  // Written as explicit fields rather than constructor parameter properties:
  // Node's --experimental-strip-types cannot handle the shorthand.
  private readonly minIntervalMs: number;
  private readonly userAgent: string;

  constructor(
    minIntervalMs = 600,
    userAgent = 'NelliesBot/0.1 (personal resale research; contact via GitHub SabihSiddiqui1337/NelliesBot)',
  ) {
    this.minIntervalMs = minIntervalMs;
    this.userAgent = userAgent;
  }

  private cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private absorbCookies(res: Response): void {
    // getSetCookie() keeps multiple Set-Cookie headers separate; a plain
    // get('set-cookie') would join them and corrupt values containing commas.
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const pair = line.split(';', 1)[0] ?? '';
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  /** Keeps request rate polite; robots.txt disallows /search for crawlers. */
  private async throttle(): Promise<void> {
    const wait = this.minIntervalMs - (Date.now() - this.lastRequest);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequest = Date.now();
  }

  /**
   * Sustained scanning trips connection failures partway through a run — the
   * first pass lost 8 of 17 categories to bare `fetch failed` errors. Retrying
   * with exponential backoff recovers them; without this the digest silently
   * covers half the catalog and still reports success.
   */
  private async request(path: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
    await this.throttle();
    try {
      const res = await fetch(`${BASE}${path}`, {
        ...init,
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json, text/plain, */*',
          ...(this.cookies.size ? { Cookie: this.cookieHeader() } : {}),
          ...init.headers,
        },
      });

      // Back off on throttling responses rather than hammering through them.
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        await this.backoff(attempt);
        return this.request(path, init, attempt + 1);
      }

      this.absorbCookies(res);
      return res;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await this.backoff(attempt);
        return this.request(path, init, attempt + 1);
      }
      throw new Error(
        `request to ${path} failed after ${MAX_RETRIES + 1} attempts: ${(err as Error).message}`,
      );
    }
  }

  private async backoff(attempt: number): Promise<void> {
    const ms = Math.min(8000, 750 * 2 ** attempt) + Math.random() * 400;
    await new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Switches the session's shopping location and verifies it took effect.
   * Houston is id 5 (SW Houston + Katy). Ids 3, 4 and 9+ are invalid and are
   * silently ignored by the server, hence the read-back.
   */
  async setShoppingLocation(id: number): Promise<string> {
    await this.request('/change-shopping-location', {
      method: 'POST',
      body: new URLSearchParams({ shoppingLocationId: String(id) }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const check = await this.search({});
    const got = check.currentShoppingLocation;
    if (got?.id !== id) {
      throw new Error(
        `Shopping location did not change: asked for id ${id}, session reports ` +
          `${got?.id} (${got?.name}). The id is probably invalid — the server ` +
          `accepts unknown ids and keeps the previous location.`,
      );
    }
    return got.name;
  }

  /** One page of search results. `filters` are plain facet name/value pairs. */
  async search(opts: {
    query?: string;
    filters?: Record<string, string>;
    /** 0-indexed page. Page 0 omits the cursor, matching the site's own links. */
    page?: number;
  }): Promise<SearchResponse> {
    const params = new URLSearchParams({ query: opts.query ?? '' });
    for (const [k, v] of Object.entries(opts.filters ?? {})) params.set(k, v);
    if (opts.page && opts.page > 0) {
      params.set('_p1', `s:${opts.page * 120},n:${opts.page}`);
    }
    params.set('_data', 'routes/search');

    const res = await this.request(`/search?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Nellis search failed: HTTP ${res.status} for ?${params}`);
    }
    return (await res.json()) as SearchResponse;
  }

  /**
   * Walks a filtered slice, deduplicating by product id.
   *
   * Paging semantics here are not fully pinned down — `s:240,n:2` returned 240
   * items rather than 120, and `s:480,n:4` returned none — so this does not
   * trust the cursor arithmetic. It stops as soon as a page contributes no new
   * ids, which is correct whether the endpoint is offset-based, cumulative, or
   * capped. Slices are meant to be small; partition by facet rather than
   * paging deep. See docs/RECON.md.
   */
  async collect(
    opts: { query?: string; filters?: Record<string, string> },
    maxPages = 8,
  ): Promise<{ products: Product[]; reportedTotal: number; pagesRead: number; complete: boolean }> {
    const byId = new Map<number, Product>();
    let reportedTotal = 0;
    let pagesRead = 0;

    for (let page = 0; page < maxPages; page++) {
      let res;
      try {
        res = await this.search({ ...opts, page });
      } catch (err) {
        // A small category 404s once you page past its last result. That is the
        // end of the slice, not a failure — only treat it as an error on page 0.
        if (page > 0 && /HTTP 404/.test((err as Error).message)) break;
        throw err;
      }
      reportedTotal = res.algolia?.nbHits ?? reportedTotal;
      pagesRead++;

      const before = byId.size;
      for (const p of res.products ?? []) byId.set(p.id, p);
      const gained = byId.size - before;

      if (gained === 0) break;                       // no progress: cursor exhausted or capped
      if (byId.size >= reportedTotal) break;         // got everything the server claims
    }

    return {
      products: [...byId.values()],
      reportedTotal,
      pagesRead,
      complete: byId.size >= reportedTotal,
    };
  }
}
