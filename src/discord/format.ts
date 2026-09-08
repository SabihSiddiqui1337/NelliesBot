import type { Candidate } from '../scoring/score.ts';
import { HOUSTON_FBMP } from '../economics/cost.ts';

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
    // Only three inline fields: everything about money now lives in the
    // breakdown block below, and repeating it here just doubles the reading.
    fields: [
      { name: 'Retail', value: money(p.retailPrice), inline: true },
      { name: 'Condition', value: condition, inline: true },
      { name: 'Pickup', value: p.location?.name ?? '?', inline: true },
    ],
    footer: {
      text: c.liquidityNotes.length
        ? `⚠︎ ${c.liquidityNotes.join(' · ')} · estimate confidence ${(c.resale.confidence * 100).toFixed(0)}%`
        : `Resale is an estimate from retail, not a measured comp · confidence ${(c.resale.confidence * 100).toFixed(0)}%`,
    },
  };

  embed.fields.push({
    name: 'Cost breakdown',
    value: costBreakdown(p.currentPrice, e.maxBid, c.resale.price),
    inline: false,
  });

  const photo = p.photos?.[0]?.url;
  if (photo) embed.thumbnail = { url: photo };

  return embed;
}

/**
 * Side-by-side cost ladder: what you pay at the current bid, and what you would
 * pay bidding all the way to the cap.
 *
 * Rendered as a code block because Discord only honours column alignment in
 * monospace. Every line is shown, including the handling allowance, so the
 * arithmetic can be checked by eye — a breakdown whose numbers do not visibly
 * add up is worse than no breakdown.
 */
function costBreakdown(currentBid: number, maxBid: number, salePrice: number): string {
  const { buyersPremiumRate, salesTaxRate, handlingCost } = HOUSTON_FBMP;

  // Each component is rounded to cents BEFORE the total is summed, so the
  // column always adds up on screen. Totalling first and rounding after leaves
  // a one-cent discrepancy between the parts and the total, which reads as a
  // bug and undermines the whole breakdown.
  const cents = (n: number) => Math.round(n * 100) / 100;

  const ladder = (hammer: number) => {
    const h = cents(hammer);
    const premium = cents(h * buyersPremiumRate);
    const tax = cents((h + premium) * salesTaxRate);
    const youPay = cents(h + premium + tax);
    return { hammer: h, premium, tax, youPay, profit: cents(salePrice - youPay - handlingCost) };
  };

  const now = ladder(currentBid);
  const max = ladder(maxBid);

  const LABEL = 17;
  const NUM = 11;
  const money = (n: number) => `$${n.toFixed(2)}`;
  const row = (label: string, a: string, b: string) =>
    label.padEnd(LABEL) + a.padStart(NUM) + b.padStart(NUM);
  const rule = '-'.repeat(LABEL + NUM * 2);

  const lines = [
    row('', 'BID NOW', 'YOUR MAX'),
    rule,
    row('Hammer price', money(now.hammer), money(max.hammer)),
    row(`Buyer's premium`, money(now.premium), money(max.premium)),
    row(`Sales tax`, money(now.tax), money(max.tax)),
    rule,
    row('YOU PAY', money(now.youPay), money(max.youPay)),
    '',
    row('Sells for ~', money(salePrice), money(salePrice)),
    row('Handling', `-${money(handlingCost)}`, `-${money(handlingCost)}`),
    row('PROFIT', money(now.profit), money(max.profit)),
  ];

  return ['```', ...lines, '```'].join('\n');
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
