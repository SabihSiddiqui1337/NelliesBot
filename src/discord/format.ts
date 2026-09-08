import type { Candidate } from '../scoring/score.ts';
import { HOUSTON_FBMP } from '../economics/cost.ts';

/** Written as a constant because a literal escape is easy to mangle in edits. */
const NEWLINE = String.fromCharCode(10);

const GREEN = 0x2ecc71;
const AMBER = 0xf1c40f;

/** Discord renders <t:unix:R> as a live countdown, so "time left" stays true. */
function relativeTime(d: Date): string {
  return `<t:${Math.floor(d.getTime() / 1000)}:R>`;
}

/**
 * Wall-clock close time, e.g. "10:45 PM". Discord localises this to whoever is
 * reading it, so it is correct without hard-coding Central time.
 */
function clockTime(d: Date): string {
  return `<t:${Math.floor(d.getTime() / 1000)}:t>`;
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
    `Now **${money(p.currentPrice)}** · ${p.bidCount} bids · closes ${relativeTime(c.closesAt)} (${clockTime(c.closesAt)})`,
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
    name: `If you win at ${money(e.maxBid)}`,
    value: costLadder(e.maxBid, c.resale.price),
    inline: false,
  });

  const photo = p.photos?.[0]?.url;
  if (photo) embed.thumbnail = { url: photo };

  return embed;
}

/**
 * Single-column cost ladder for the max bid.
 *
 * Deliberately narrow — 24 characters — because Discord shrinks or wraps a
 * code block that overflows a phone screen, and this is read on a phone. An
 * earlier two-column version showing the current bid's cost alongside broke
 * on mobile for exactly that reason, and the second column was not worth
 * having anyway: with hours of bidding left, what the lot costs right now
 * tells you nothing.
 *
 * Components are rounded to cents before the total is summed, so the column
 * always adds up on screen.
 */
function costLadder(maxBid: number, salePrice: number): string {
  const { buyersPremiumRate, salesTaxRate, handlingCost } = HOUSTON_FBMP;
  const cents = (n: number) => Math.round(n * 100) / 100;

  const hammer = cents(maxBid);
  const premium = cents(hammer * buyersPremiumRate);
  const tax = cents((hammer + premium) * salesTaxRate);
  const youPay = cents(hammer + premium + tax);
  const profit = cents(salePrice - youPay - handlingCost);

  const LABEL = 14;
  const NUM = 10;
  const row = (l: string, n: number, sign = '') =>
    l.padEnd(LABEL) + `${sign}$${Math.abs(n).toFixed(2)}`.padStart(NUM);
  const rule = '-'.repeat(LABEL + NUM);

  return [
    '```',
    row('Your bid', hammer),
    row(`+ premium 15%`, premium),
    row(`+ tax 8.25%`, tax),
    rule,
    row('YOU PAY', youPay),
    '',
    row('Sells for ~', salePrice),
    row('- handling', handlingCost, '-'),
    rule,
    row('PROFIT', profit),
    '```',
  ].join(NEWLINE);
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
