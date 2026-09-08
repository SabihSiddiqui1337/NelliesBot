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
- **Demand data source.** eBay sold comps vs Keepa (Amazon sales rank) vs
  heuristics. Cost/accuracy tradeoff. Most lot photos are hosted on
  `m.media-amazon.com`, which suggests Amazon-sourced items and favours Keepa.
- **Resale fees.** The draft format computes profit from gross sale price. Real
  net must subtract marketplace fees (~13% on eBay) and shipping, or the profit
  figure is fiction.
- **Funnel cost.** ~32k open lots; per-item demand lookups cannot run on all of
  them. Needs cheap filters first, expensive lookups only on finalists.
