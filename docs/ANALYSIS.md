# Analysis — what this can and cannot know

Written 2026-09-08 after building and running the pipeline against live
Houston inventory. Read `docs/RECON.md` for how the site works and
`docs/REQUIREMENTS.md` for the goal.

## The economics

Buy side, Houston:

```
out of pocket = hammer x 1.15 (buyer's premium) x 1.0825 (8.25% sales tax)
              = hammer x 1.2449
```

Sell side, Facebook Marketplace local pickup: **no seller fee**. The sale price
is the net. This is the single biggest advantage of choosing FBMP over eBay,
where ~13% plus shipping would come off the top.

Max bid is therefore derived, not guessed:

```
max hammer = (estimated sale price - handling) / (1 + target margin) / 1.2449
```

At the default 3x target, a lot you expect to sell for $300 is worth **$79** at
the hammer, not $100. That number is bid discipline — the point at which
walking away is correct.

### Worked example, from a real lot in tonight's scan

> Ruvati 33-in Fireclay Farmhouse Sink — retail $1,299, current bid $70

| | |
| --- | --- |
| Estimated FBMP local price | $487 |
| Max bid at 3x target | **$117.81** |
| Out of pocket at $70 bid | $87.14 |
| Profit if it sells at estimate | $352.86 |
| Return on cost | 4.05x |

Bid up to $117. Above that, the margin stops justifying the work.

## The funnel

~32,800 open Houston lots is far too many to research individually, so cost
rises only as candidates survive:

| Stage | Filter | Cost | Survivors (measured) |
| --- | --- | --- | --- |
| 1 | Category partition, 3 pages each | 17 requests-ish | 6,613 local lots |
| 2 | Retail >= $80 | free | — |
| 3 | Condition screen (`grade` sub-fields) | free | — |
| 4 | Liquidity screen (parts, stock photos, vague titles) | free | — |
| 5 | Economics: clears 3x and $30 absolute | free | **328** |
| 6 | Rank by profit x confidence x demand, take top N | free | **20** |

Every stage is free today. That is deliberate: it leaves the entire budget
available for a demand API if one is ever warranted.

## What the first live run taught us

**Ranking on estimated profit alone produces garbage.** The initial top ten was
salt chlorine generators, D.E. filter tank lids, pump circuit boards, a pool
liner, and assorted "fits Pentair / Hayward" spares. All had high suggested
retail and a $1-$30 bid.

They are also nearly unsellable locally. The buyer pool for a Pentair IC40
replacement cell is the handful of Houston households that own that exact
system and need that exact part this week. **A high retail price with no
bidders is usually the auction telling you something**, and the fix
(`src/scoring/liquidity.ts`) discounts spare parts, compatibility items,
listings that admit the photo is not the actual item, and titles too vague to
price.

After that change the shortlist became barn doors, farmhouse sinks, ladders,
carports, dressers, window AC units and chandeliers — bulky, recognisable,
locally sellable goods.

**Bulky is an advantage here, not a liability.** eBay resellers avoid heavy
items because shipping destroys the margin, so those lots go cheap at auction.
On local pickup that discount is pure upside, which is why
`CATEGORY_LOCAL_DEMAND` scores furniture and appliances *above* baseline and
clothing and media well below.

## The honest weak point

`estimateResale()` is the least trustworthy part of the system, and everything
downstream inherits its error.

FBMP publishes no sold-comps API, so v1 derives a local price from Nellis's own
suggested retail, discounted by condition and category. Those ratios are
reasoned estimates, **not measurements**. A retail anchor can also simply be
wrong — sellers inflate it, and a $9.99 item with a $200 "retail" is common.

Three ways to fix it, in order of preference:

1. **Learn from Nellis itself (free, already scaffolded).** `store/db.ts`
   records every lot seen and what it finally closed for. After a few weeks
   there is a measured answer to "what does this category actually fetch in
   Houston" — replacing the guessed recovery ratios with observed ones. This is
   the highest-value next step and costs nothing. `settle` is not implemented
   yet.
2. **Keepa (~$21/mo, inside budget).** Most lot photos are served from
   `m.media-amazon.com`, so these are largely Amazon returns. Keepa's sales
   rank is a genuine demand measure rather than a proxy. Requires an account
   and payment, so it needs you — I cannot sign up on your behalf.
3. **Manual feedback loop.** Record what you actually bought and sold it for.
   Small sample, but it is ground truth about *your* market.

Option 1 should run regardless. Option 2 only becomes worth $21/mo once option 1
shows where the estimates are actually wrong.

## Timing: why the morning digest is a watchlist

Lots close 6-10 PM CT and essentially all price formation happens in the final
minutes — the 30-second soft close guarantees it. A lot sitting at $3 in the
morning tells you almost nothing about where it lands.

So the morning digest answers *"what is worth watching tonight"*, not *"what is
cheap right now"*. The natural second stage is a pass around 5:30 PM that
re-prices the shortlist and alerts on anything still under its max bid. That is
where the actionable signal is, and it is not built yet.

**Sniping is pointless here.** Any bid inside the last 30 seconds extends the
close, so there is no last-second advantage to win — only a price war. The edge
is entirely in *which* lots you chase and *what you refuse to pay*.

## Known gaps

- `settle` is a stub; without it the store never learns.
- No evening re-pricing pass.
- Scan reads 3 pages per category, so it samples rather than enumerates. A lot
  can be missed.
- Parts detection still leaks: an "E-Z-GO drive clutch" and a "Marine A/C pump"
  survived the latest run.
- Sales tax is assumed to apply to hammer + premium. Verify against a real
  invoice.
- No dedupe across runs, so the same lot can appear in consecutive digests.
