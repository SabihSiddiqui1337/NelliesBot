# NelliesBot — requirements

As stated by Sabih on 2026-09-08. Analysis and design phase; no build yet.

## Goal

Surface Nellis Auction lots that are **good resale candidates with a currently
low bid**, in the Houston market, and push them to Discord.

## Scope

| Item | Value |
| --- | --- |
| Market | Houston, TX (`shoppingLocationId: 5`) |
| Warehouses | SW Houston, Katy (both; pickup is in person) |
| Close window | ~6:00 PM - 10:00 PM CT daily |
| Soft close | 30s reset on each bid inside the final 30s; never exceeds 30s |
| Output | Discord notification (webhook; Sabih owns the server) |
| Cadence | Morning digest — "items posted for that day" |
| Volume | Top 20, ranked by profit margin |
| Resale channel | **Facebook Marketplace** (local) |
| Budget | **~$50/month** all-in, including data and hosting |
| Bidding | **Alerts only.** Automated bidding is explicitly out of scope for now |

## Required signals

1. **Resale demand** — must be high. Requires an external comps/demand source;
   this is the hard part and the main cost decision.
2. **Landed cost** — 15% buyer's premium **plus** sales tax on top of the
   hammer price. Must be modelled, not ignored.
3. **Condition** — exclude broken/junk. But if the *photos* look good while the
   grade says damaged, still surface it flagged for manual verification rather
   than dropping it.
4. **Photos** — include in the alert so a human can eyeball it.

## Requested message format (Sabih's draft, open to revision)

```
Item name:
Item current price:
Item Retail Price:
Time Left:
Link:

Maximum bid to offer:
Online selling at:
Total + 15% =
Total with 15% + taxes:

Total out of pocket
Selling for:

Profit:
```

## Open design questions

- **Timing.** Lots close 6-10 PM CT but the digest is requested for the morning.
  A morning `currentPrice` is near-meaningless — nearly all price formation
  happens in the final minutes. A morning digest is a *watchlist*, not a
  decision. Likely needs a second pass near close. **Needs a decision.**
- **Demand data source.** Keepa (Amazon sales rank) vs eBay Browse API vs
  heuristics, inside the $50/mo budget. Most lot photos are hosted on
  `m.media-amazon.com`, which suggests Amazon-sourced items and favours Keepa.
- **Resale fees are now near-zero.** Facebook Marketplace charges no seller fee
  on local pickup sales, which materially improves margins versus eBay's ~13%.
  The cost model is therefore buy-side only: hammer + 15% premium + sales tax,
  against a local cash sale price.
- **FBMP changes what to source.** Local pickup means bulky, heavy items
  (furniture, appliances, exercise equipment) are an *advantage* rather than a
  shipping liability — and they are exactly what other resellers skip, so they
  go cheap. Worth weighting toward, not filtering out.
- **FBMP has no comps API.** Amazon/eBay data can establish demand and a retail
  anchor, but the realisable local price must be derived from them, not copied.
- **Funnel cost.** ~32k open lots; per-item demand lookups cannot run on all of
  them. Needs cheap filters first, expensive lookups only on finalists.
