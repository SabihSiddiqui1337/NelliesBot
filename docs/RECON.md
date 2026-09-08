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
