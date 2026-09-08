import type { Candidate } from '../scoring/score.ts';
import type { Embed } from './format.ts';
import { landedMultiplier } from '../economics/cost.ts';

/**
 * Three candidate layouts, posted side by side so a format can be chosen by
 * looking at it rather than described in the abstract. Once one is picked the
 * other two go away and this file with them.
 */

const GREEN = 0x2ecc71;
const AMBER = 0xf1c40f;

function money(n: number): string {
  return n >= 1000
    ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : `$${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
}
const rel = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:R>`;
const clock = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:t>`;

function base(c: Candidate, label: string): Embed {
  const flagged = c.condition.verdict === 'flag';
  const embed: Embed = {
    title: `[${label}] ${c.product.title}`.slice(0, 250),
    url: c.url,
    color: flagged ? AMBER : GREEN,
    fields: [],
  };
  const photo = c.product.photos?.[0]?.url;
  if (photo) embed.thumbnail = { url: photo };
  return embed;
}

/** A — bare minimum. Profit, the bid cap, and when it ends. Nothing else. */
export function variantA(c: Candidate): Embed {
  const e = base(c, 'A');
  e.description = [
    `## ${money(c.economics.profitAtCurrentBid)} profit`,
    `# 🔨 Bid up to ${money(c.economics.maxBid)}`,
    `Now ${money(c.product.currentPrice)} · ends ${rel(c.closesAt)} (${clock(c.closesAt)})`,
  ].join('\n');
  return e;
}

/** B — a labelled vertical list, closest to the original written spec. */
export function variantB(c: Candidate): Embed {
  const e = base(c, 'B');
  const allIn = c.economics.maxBid * landedMultiplier();
  e.description = [
    `**Current bid:**  ${money(c.product.currentPrice)}  (${c.product.bidCount} bids)`,
    `**Retail:**  ${money(c.product.retailPrice)}`,
    `**Closes:**  ${rel(c.closesAt)} · ${clock(c.closesAt)}`,
    `**Pickup:**  ${c.product.location?.name ?? '?'}`,
    '',
    `**🔨 Max bid:**  ${money(c.economics.maxBid)}`,
    `**Total out of pocket:**  ${money(allIn)}  *(incl. 15% + tax)*`,
    `**Sells for ~**  ${money(c.resale.price)}`,
    `**💰 Profit:**  ${money(c.economics.profitAtCurrentBid)}  (${c.economics.roiAtCurrentBid.toFixed(1)}x)`,
  ].join('\n');
  return e;
}

/** C — headline plus a grid of chips, no prose. */
export function variantC(c: Candidate): Embed {
  const e = base(c, 'C');
  const allIn = c.economics.maxBid * landedMultiplier();
  e.description = `## 💰 ${money(c.economics.profitAtCurrentBid)} profit · ${c.economics.roiAtCurrentBid.toFixed(1)}x`;
  e.fields = [
    { name: '🔨 Max bid', value: `**${money(c.economics.maxBid)}**`, inline: true },
    { name: 'Out of pocket', value: money(allIn), inline: true },
    { name: 'Sells for ~', value: money(c.resale.price), inline: true },
    { name: 'Current bid', value: `${money(c.product.currentPrice)} (${c.product.bidCount})`, inline: true },
    { name: 'Retail', value: money(c.product.retailPrice), inline: true },
    { name: 'Pickup', value: c.product.location?.name ?? '?', inline: true },
    { name: 'Closes', value: `${rel(c.closesAt)} · ${clock(c.closesAt)}`, inline: false },
  ];
  return e;
}

export const VARIANTS = { A: variantA, B: variantB, C: variantC };
