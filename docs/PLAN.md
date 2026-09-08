# NelliesBot — Plan

Target site: **Nellis Auction** (https://www.nellisauction.com/) — liquidation
and retail-returns auctions, local pickup only. See [RECON.md](RECON.md) for how
the site actually works.

## Open questions

- **What does the bot do?** Deal finder / alerting is the assumed default.
  Confirm the trigger, the criteria, and where alerts land.
- **Where do alerts go?** Discord / Telegram / email / local dashboard.
- **Which locations?** Pickup is in person, so this is a hard filter.
- **Authenticated actions?** Read-only monitoring is the safe foundation.
  Anything that touches a logged-in session is a separate decision — see the
  Kount and terms notes in RECON.md.

## Decisions

| Date | Decision | Rationale |
| ---- | -------- | --------- |
| 2026-09-08 | Repo bootstrapped, language deferred | Scope not yet defined |
| 2026-09-08 | Target is Nellis Auction | Confirmed by recon |
| 2026-09-08 | Read via Remix `?_data=` loaders, not HTML scraping | Loaders return clean typed JSON; no headless browser needed |
| 2026-09-08 | TypeScript on Node (proposed) | Matches every sibling repo (TS + Playwright 1.59); payload is JSON from a JS app; Playwright already available if a browser is ever needed |
| 2026-09-08 | Not a sniping bot | `extensionInterval: 30` soft-close makes last-second bids pointless |

## Notes

Fill in as the design firms up.
