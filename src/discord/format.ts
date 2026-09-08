import type { Candidate } from '../scoring/score.ts';

const GREEN = 0x2ecc71;
const AMBER = 0xf1c40f;

/** Discord renders <t:unix:R> as a live countdown, so "time left" stays true. */
function relativeTime(d: Date): string {
  return `<t:${Math.floor(d.getTime() / 1000)}:R>`;
}

function money(n: number): string {
  return n >= 1000
    ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : `$${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
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
 * One lot, laid out to be read in about two seconds.
 *
 * Layout notes: the profit and the max bid are the only two numbers that drive
 * a decision, so they go in the description as markdown headings — the only
 * way to get large text inside a Discord embed. Everything else is a compact
 * inline field. Discord packs inline fields three to a row, so the field count
 * is kept to a multiple of three; an earlier version used full-width separator
 * rows ("— Bid discipline —") which forced a tall vertical wall of text.
 */
export function candidateEmbed(c: Candidate): Embed {
  const p = c.product;
  const e = c.economics;
  const flagged = c.condition.verdict === 'flag';

  const headline = [
    `## 💰 ${money(e.profitAtCurrentBid)} profit  ·  ${e.roiAtCurrentBid.toFixed(1)}x`,
    `### 🔨 Bid up to ${money(e.maxBid)}`,
    `Currently **${money(p.currentPrice)}** · ${p.bidCount} bids · closes ${relativeTime(c.closesAt)}`,
  ];

  if (flagged) {
    headline.push(`⚠️ **Check the photos** — ${c.condition.reasons.join(', ')}`);
  }

  const condition = p.grade
    ? `${p.grade.conditionType?.description ?? '?'}${
        p.grade.damageType?.description && p.grade.damageType.description !== 'None'
          ? ` · ${p.grade.damageType.description.toLowerCase()} damage`
          : ''
      }`
    : 'unknown';

  const embed: Embed = {
    title: p.title.slice(0, 250),
    url: c.url,
    color: flagged ? AMBER : GREEN,
    description: headline.join('\n'),
    fields: [
      { name: 'You pay', value: money(e.landedAtCurrentBid), inline: true },
      { name: 'Sells for ~', value: money(c.resale.price), inline: true },
      { name: 'Retail', value: money(p.retailPrice), inline: true },

      { name: 'Condition', value: condition, inline: true },
      { name: 'Pickup', value: p.location?.name ?? '?', inline: true },
      { name: 'Confidence', value: `${(c.resale.confidence * 100).toFixed(0)}%`, inline: true },
    ],
    footer: {
      text: c.liquidityNotes.length
        ? `⚠︎ ${c.liquidityNotes.join(' · ')}`
        : 'resale figure is an estimate from retail, not a measured comp',
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
    `## 🔨 Nellis Houston — tonight's shortlist`,
    `**${counts.scanned.toLocaleString()}** lots scanned · **${counts.candidates}** passed · top **${counts.shown}**` +
      (counts.flagged ? ` · ⚠️ **${counts.flagged}** need a photo check` : ''),
    `_Most bidding happens in the last minutes, so these prices will move. Treat it as a watchlist._`,
  ].join('\n');
}
