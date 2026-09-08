import type { Candidate } from '../scoring/score.ts';

const GREEN = 0x2ecc71;
const AMBER = 0xf1c40f;

/** Discord renders <t:unix:R> as a live countdown, so "time left" stays true. */
function relativeTime(d: Date): string {
  return `<t:${Math.floor(d.getTime() / 1000)}:R>`;
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export interface Embed {
  title: string;
  url: string;
  color: number;
  description?: string;
  fields: { name: string; value: string; inline?: boolean }[];
  thumbnail?: { url: string };
  footer?: { text: string };
}

/**
 * One lot as a Discord embed.
 *
 * Deviates from the original sketch in three places, all deliberate:
 *  - "Online selling at" is labelled an *estimate*, because it is derived from
 *    Nellis's retail figure rather than measured FBMP comps.
 *  - No eBay-style fee line: FBMP local pickup takes no seller cut, so the
 *    sale price is the net. The 15% + tax applies on the BUY side only.
 *  - Max bid leads, because it is the only number that governs an action.
 */
export function candidateEmbed(c: Candidate): Embed {
  const p = c.product;
  const e = c.economics;
  const flagged = c.condition.verdict === 'flag';

  const fields = [
    { name: 'Current bid', value: money(p.currentPrice), inline: true },
    { name: 'Retail', value: money(p.retailPrice), inline: true },
    { name: 'Bids', value: String(p.bidCount), inline: true },

    { name: '\u200b', value: '**— Bid discipline —**', inline: false },
    { name: 'MAX BID', value: `**${money(e.maxBid)}**`, inline: true },
    { name: 'Out of pocket at max', value: money(e.maxBid * 1.244875), inline: true },
    { name: 'Out of pocket now', value: money(e.landedAtCurrentBid), inline: true },

    { name: '\u200b', value: '**— If it sells —**', inline: false },
    { name: 'Est. FBMP price', value: `${money(c.resale.price)} *(est.)*`, inline: true },
    { name: 'Profit at current bid', value: `**${money(e.profitAtCurrentBid)}**`, inline: true },
    { name: 'Return on cost', value: `${e.roiAtCurrentBid.toFixed(2)}x`, inline: true },

    { name: '\u200b', value: '**— Details —**', inline: false },
    { name: 'Closes', value: relativeTime(c.closesAt), inline: true },
    { name: 'Pickup', value: p.location?.name ?? 'unknown', inline: true },
    {
      name: 'Condition',
      value: p.grade
        ? `${p.grade.conditionType?.description ?? '?'} · damage ${p.grade.damageType?.description ?? '?'}`
        : 'unknown',
      inline: true,
    },
  ];

  if (flagged) {
    fields.push({
      name: '⚠️ Needs your eyes',
      value: `Flagged: ${c.condition.reasons.join(', ')}. Photos may still look fine — verify before bidding.`,
      inline: false,
    });
  }

  const embed: Embed = {
    title: p.title.slice(0, 250),
    url: c.url,
    color: flagged ? AMBER : GREEN,
    fields,
    footer: {
      text: `confidence ${(c.resale.confidence * 100).toFixed(0)}% · demand ${(c.demandScore * 100).toFixed(0)}% · ${c.resale.basis}`.slice(0, 2040),
    },
  };

  const photo = p.photos?.[0]?.url;
  if (photo) embed.thumbnail = { url: photo };

  return embed;
}

export function digestHeader(counts: {
  scanned: number;
  candidates: number;
  shown: number;
  flagged: number;
}): string {
  return [
    `## 🔨 Nellis Houston — daily shortlist`,
    `Scanned **${counts.scanned.toLocaleString()}** lots · **${counts.candidates}** cleared the filters · showing top **${counts.shown}**` +
      (counts.flagged ? ` · **${counts.flagged}** flagged for manual check` : ''),
    `_Prices are as of now. Nearly all bidding happens in the last minutes before close, so treat this as a watchlist, not a buy list._`,
  ].join('\n');
}
