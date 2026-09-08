import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  landedCost, landedMultiplier, maxBid, profitAt, evaluate, HOUSTON_FBMP,
  type CostModel,
} from '../src/economics/cost.ts';

test('landed cost applies premium then tax', () => {
  // $100 hammer -> $115 with premium -> $124.49 with 8.25% tax
  assert.equal(Math.round(landedCost(100) * 100) / 100, 124.49);
});

test('landed multiplier is ~1.2449 for Houston', () => {
  assert.ok(Math.abs(landedMultiplier() - 1.244875) < 1e-6);
});

test('a bid at maxBid clears exactly the target margin', () => {
  const sale = 300;
  const margin = 2; // want 3x out-of-pocket
  const cap = maxBid(sale, margin);
  const landed = landedCost(cap);
  const profit = profitAt(cap, sale);
  // profit / landed should sit at (or a hair under, from flooring) the target
  const achieved = profit / landed;
  assert.ok(achieved >= margin - 0.02, `achieved ${achieved}, wanted >= ${margin}`);
  assert.ok(achieved <= margin + 0.05, `achieved ${achieved}, overshot ${margin}`);
});

test('maxBid returns 0 when handling cost alone eats the sale', () => {
  assert.equal(maxBid(4, 2), 0);
});

test('FBMP keeps the full sale price; an eBay-like fee reduces the cap', () => {
  const ebayish: CostModel = { ...HOUSTON_FBMP, sellerFeeRate: 0.13 };
  assert.ok(maxBid(200, 2, ebayish) < maxBid(200, 2, HOUSTON_FBMP));
});

test('profitable is not the same as worth bidding', () => {
  // $100 hammer on a $150 resale still nets $20.51, but that is a 0.16x
  // return on $124.49 out of pocket — nowhere near the 3x target, so the
  // bot must decline it rather than call it a win.
  const e = evaluate(/* currentBid */ 100, /* sale */ 150, /* margin */ 2);
  assert.equal(e.worthBidding, false);
  assert.ok(e.profitAtCurrentBid > 0, 'still nominally profitable');
  assert.ok(e.roiAtCurrentBid < 2, 'but under the target margin');
});

test('evaluate reports a loss when the bid exceeds the resale price', () => {
  const e = evaluate(/* currentBid */ 200, /* sale */ 150, /* margin */ 2);
  assert.equal(e.worthBidding, false);
  assert.ok(e.profitAtCurrentBid < 0);
});

test('evaluate accepts a cheap lot with real headroom', () => {
  const e = evaluate(20, 200, 2);
  assert.equal(e.worthBidding, true);
  assert.ok(e.profitAtCurrentBid > 0);
  assert.ok(e.roiAtCurrentBid > 2);
});
