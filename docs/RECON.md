# Nellis Auction — technical recon

Captured 2026-09-08 against https://www.nellisauction.com/. Re-verify before
relying on any of this; it is an observation of a live site, not a contract.

## Stack

Remix / React Router SSR app. Client bundle loads Algolia and Kount
(device-fingerprinting fraud detection).

## Data access

Route loaders expose JSON directly — no HTML scraping, no headless browser:

```
GET /search?query=<term>&_data=routes/search   ->  application/json
```

Returns `products[]` plus `facets` (counts by location / category / auction
event), `searchResultsCount`, `selectedFilters`.

A `/search.data?query=<term>` endpoint also exists but returns React Router's
turbo-stream encoding, which is far more painful to parse. Prefer `_data`.

### Product shape

| Field | Type | Notes |
| --- | --- | --- |
| `id` | number | Also the last path segment of `/p/<slug>/<id>` |
| `inventoryNumber` | string | Warehouse-side identifier |
| `title` | string | |
| `retailPrice` | number | Reference retail, the deal-ratio denominator |
| `currentPrice` | number | Live high bid |
| `bidCount` | number | |
| `openTime` / `closeTime` | ISO 8601 | |
| `initialCloseTime` | ISO 8601 | Differs from `closeTime` once extended |
| `extensionInterval` | number | Seconds — soft close, see below |
| `projectExtended` | boolean | |
| `isClosed` / `marketStatus` | boolean / string | e.g. `"open"` |
| `notReturnable` | boolean | |
| `notes` | string \| null | |
| `location` | object | `name`, `address`, `city`, `state`, `zipCode`, `timezone` |
| `photos[]` | object | Amazon CDN and/or Firebase Storage URLs |
| `grade` | object | See below |

### Grade sub-object

`rating` (1-5) plus enum'd descriptors, each `{id, description}`:
`conditionType` (e.g. "Used"), `damageType`, `missingPartsType`,
`functionalType`, `packageType`, `assemblyType`, `categoryType`.

This is the strongest junk filter available — a high retail-to-current ratio on
a low `grade.rating` with `missingPartsType: Yes` is a trap, not a deal.

## Constraints

**Soft close.** `extensionInterval: 30` — a bid inside the final 30 seconds
extends the close. Classic last-second sniping is therefore worthless here; the
edge is in *finding* underpriced lots, not in bid timing.

**robots.txt.** `Disallow: /` with an allow-list:

```
Allow: /$        Allow: /p/       Allow: /browse
Allow: /sitemap*.xml$             (plus static asset paths)
Sitemap: https://www.nellisauction.com/sitemap.xml
```

`/search` is *not* allowed. Prefer `/browse` and the sitemap where practical,
keep request rates low, and cache aggressively.

**Kount.** Fraud/bot detection on authenticated flows. Automating a logged-in
session (bidding, checkout) is a materially different risk category from
reading public listings, and is very likely prohibited by their terms. Read-only
monitoring is the safe foundation; anything authenticated is a deliberate,
separately-considered decision.

**Pickup is local and in person.** `location` is a hard filter, not a nice-to-
have — winning a lot at a warehouse you can't drive to is a loss. Nellis also
charges a buyer's premium (~15%) plus tax on top of the hammer price, so any
"deal score" must compute landed cost, not hammer price.

## Shopping location (Houston)

Location is **session/cookie scoped**, not a URL parameter. Filter params on
`/search` (`locationName`, `Location`, `refinementList[...]`) are all ignored.
Browsing `/browse/TX/Houston` does *not* change it either. The only mechanism
found:

```
POST /change-shopping-location
Content-Type: application/x-www-form-urlencoded

shoppingLocationId=5
```

The bot must hold a cookie jar, POST this once, then reuse the session for all
subsequent `_data` reads.

### Location IDs (probed 2026-09-08)

| id | Shopping location | Warehouses | Open items |
| -- | ----------------- | ---------- | ---------- |
| 1 | Las Vegas, NV | North Las Vegas, Dean Martin, Legacy Bids, Nellis Outlet, Wild Finds Henderson, SW Las Vegas (+ estate events) | 64,795 |
| 2 | Phoenix, AZ | Phoenix, Mesa | 34,980 |
| **5** | **Houston, TX** | **SW Houston, Katy** | **32,792** |
| 6 | Philadelphia, PA | Delran | 17,285 |
| 7 | Denver, CO | Denver | 3,643 |
| 8 | Dallas, TX | Dallas, Denton | 17,930 |

IDs 3, 4, and 9+ are invalid and silently fall back to the previously set
location — do not treat a 200 as proof the switch worked. **Always read back
`currentShoppingLocation.id` from the next response and assert it.**

`/browse/TX` (`_data=routes/browse.$state`) lists TX cities: Dallas, Denton,
Houston, Katy.

## Scale (Houston, 2026-09-08)

- 32,792 open lots — SW Houston 17,007, Katy 15,785.
- Tonight's events: `Daily Auction - SW Houston - Sep 7th` (16,811 lots) and
  `Daily Auction - Katy - Sep 7th` (15,520). Note the event is named for the day
  it *opened*, not the day it closes.
- Algolia index `nellisauction-prd`, `hitsPerPage: 120`, `nbPages` capped at 250.
- Server-side filter applied automatically:
  `"Shopping Location":"<city>" AND "Market Status":"open" AND "Sensitive":0`
  plus numeric `Time Remaining >= <unix now>`.

### Distribution — why filtering must be aggressive

`starRating` facet across Houston's open inventory:

| Stars | Count | Share |
| ----- | ----- | ----- |
| 5 | 29,177 | 89% |
| 4 | 2,317 | 7% |
| 3 | 862 | 2.6% |
| 2 | 360 | 1.1% |
| 1 | 75 | 0.2% |

**`starRating` is therefore a near-useless filter on its own** — 89% of lots are
5-star. Condition screening must use the `grade` sub-fields
(`functionalType`, `damageType`, `missingPartsType`, `conditionType`).

`suggestedRetail` facet is heavily skewed to low-value goods (786 lots at $9.99
retail; the bulk sits under $40). Most of the catalog can never clear the fee
stack — a hard retail-price floor is the single highest-leverage filter.

> TODO: sample several pages to get an exact retail-price percentile breakdown
> and the close-time histogram in America/Chicago. Pagination appears to be
> `?page=N` (0-indexed); confirm `algolia.page` echoes it back.

## Pagination and filtering

**`?page=N` does nothing.** It returns HTTP 200 with the same first 120 items,
and `algolia.page` stays `0` — a silent no-op that looks like it worked. Same
for `p`, `pageNumber`, `pg`, `offset`, `from`, `start`, `currentPage`. Anything
built on those will happily scrape page 1 forty times and report success.

The real parameter, taken from the site's own "Go to next page" link:

```
/search?query=&_p1=s:120,n:1     (url-encoded: _p1=s%3A120%2Cn%3A1)
```

- `n` = 0-indexed page number; echoed back as `algolia.page`.
- `s` = size of the accumulated window, i.e. how many items are returned.

It is **cumulative, not offset-based**: `s:240,n:2` returns 240 items, `s:360,n:3`
returns 360. Later pages re-send everything before them, so naive paging
re-downloads the whole prefix each time — O(n²) bytes. `s:480,n:4` returned 0
items, so there is a ceiling somewhere around 360-480; find it before relying on
deep paging.

**Implication:** do not try to walk all ~32.8k Houston lots page by page.
Partition with facet filters and page shallowly within each slice.

### Facet filter params

Plain query-string, human-readable facet names:

```
/search?query=&Taxonomy+Level+1=Electronics
/search?query=&Brand=VEVOR
```

Known facet keys returned in `facets`: `locationName`, `auctionEventName`,
`auctionEventType`, `starRating`, `suggestedRetail`, `taxonomy1`, `taxonomy2`,
`brand`, `color`, `size`.

Taxonomy Level 1 values: Home & Household Essentials, Beauty & Personal Care,
Electronics, Automotive, Home Improvement, Clothing/Shoes & Accessories,
Outdoors & Sports, Furniture & Appliances, Pet Supplies, Patio & Garden, Baby,
Toys & Games, Office & School Supplies, Books/Music & Media,
Food/Supplements & Pantry, Bulk and Mixed Items, Smart Home.

> TODO: confirm the param name for `locationName` (to split SW Houston vs Katy)
> and for a `suggestedRetail` numeric range, which is the highest-value filter.

## Close-time window (Houston, confirmed)

Sample of 120 closing lots, `America/Chicago`:

| Hour CT | Lots |
| ------- | ---- |
| 6 PM | 42 |
| 7 PM | 33 |
| 8 PM | 28 |
| 9 PM | 17 |

Matches the stated 6-10 PM window.

**Caution on sampling:** the default result order is not random and skews to
high-retail items (that 120-lot sample had a median suggested retail of $448 and
75% above $250, while the whole-catalog `suggestedRetail` facet skews far
cheaper). Never infer catalog-wide statistics from page 1.

Condition values observed: `conditionType` in {New, Used}; `damageType` in
{None, Minor, Major}. In that sample, 6/120 were non-functional and 10/120 had
missing parts.
