import test from 'node:test';
import assert from 'node:assert/strict';
import type { Member, ReceiptLineItem } from '../types';
import {
  buildExpenseFromReceipt,
  calculateReceiptSplit,
  matchPaidByMemberId,
  matchSuggestedMemberIds,
} from './receipt';

const MEMBERS: Member[] = [
  { id: 'm1', name: 'Aarav Mehta', initials: 'AM', color: '#0f766e' },
  { id: 'm2', name: 'Maya Chen', initials: 'MC', color: '#1d4ed8' },
  { id: 'm3', name: 'Liam Patel', initials: 'LP', color: '#b45309' },
  { id: 'm4', name: 'Sofia Rossi', initials: 'SR', color: '#7c3aed' },
];

test('calculateReceiptSplit distributes items and proportional tax & tip to exact cents', () => {
  const items: ReceiptLineItem[] = [
    { id: 'i1', name: 'Shared Fries', quantity: 1, price: 12, sharedByIds: ['m1', 'm2', 'm3'] },
    { id: 'i2', name: 'Ramen', quantity: 1, price: 18, sharedByIds: ['m1'] },
    { id: 'i3', name: 'Salad', quantity: 1, price: 10, sharedByIds: ['m2'] },
    { id: 'i4', name: 'Sushi', quantity: 1, price: 20, sharedByIds: ['m3'] },
  ];
  // Items sum = 60.00: m1 = 4+18 = 22 (36.67%), m2 = 4+10 = 14 (23.33%), m3 = 4+20 = 24 (40%)
  // Tax = 6.00, Tip = 9.00 -> Grand Total = 75.00
  const result = calculateReceiptSplit({
    items,
    tax: 6,
    tip: 9,
    discount: 0,
    taxTipMode: 'proportional',
    currency: 'USD',
    members: MEMBERS,
  });

  assert.equal(result.assignedItemsTotal, 60);
  assert.equal(result.grandTotal, 75);
  assert.equal(result.unassignedItemIds.length, 0);
  assert.equal(result.perMember.m4.total, 0);

  // m1: 22 + 2.20 + 3.30 = 27.50
  assert.equal(result.perMember.m1.itemsSubtotal, 22);
  assert.equal(result.perMember.m1.taxShare, 2.2);
  assert.equal(result.perMember.m1.tipShare, 3.3);
  assert.equal(result.perMember.m1.total, 27.5);

  // m2: 14 + 1.40 + 2.10 = 17.50
  assert.equal(result.perMember.m2.total, 17.5);
  // m3: 24 + 2.40 + 3.60 = 30.00
  assert.equal(result.perMember.m3.total, 30);

  const sumTotals = Object.values(result.splitValues).reduce((s, v) => s + v, 0);
  assert.equal(Math.round(sumTotals * 100) / 100, 75);
});

test('calculateReceiptSplit handles 0-decimal JPY rounding and unassigned items cleanly', () => {
  const items: ReceiptLineItem[] = [
    { id: 'i1', name: 'Yakitori', quantity: 1, price: 1000, sharedByIds: ['m1', 'm2', 'm3'] },
    { id: 'i2', name: 'Sake', quantity: 1, price: 900, sharedByIds: [] },
  ];

  const result = calculateReceiptSplit({
    items,
    tax: 100,
    tip: 0,
    discount: 0,
    taxTipMode: 'equal',
    currency: 'JPY',
    members: MEMBERS,
  });

  assert.equal(result.assignedItemsTotal, 1000);
  assert.equal(result.unassignedItemsTotal, 900);
  assert.deepEqual(result.unassignedItemIds, ['i2']);
  assert.equal(result.grandTotal, 1100);

  const sumTotals = Object.values(result.splitValues).reduce((s, v) => s + v, 0);
  assert.equal(sumTotals, 1100);
});

test('matchSuggestedMemberIds and buildExpenseFromReceipt wire participants and exact splitValues', () => {
  assert.deepEqual(matchSuggestedMemberIds(['Maya', 'Liam'], MEMBERS), ['m2', 'm3']);
  assert.deepEqual(matchSuggestedMemberIds(['all'], MEMBERS), ['m1', 'm2', 'm3', 'm4']);
  assert.equal(matchPaidByMemberId('sofia', MEMBERS, 'm1'), 'm4');

  const { expenseData } = buildExpenseFromReceipt({
    title: 'Izakaya Night',
    currency: 'JPY',
    paidById: 'm1',
    category: 'Food & Dining',
    date: '2026-11-11',
    items: [
      { id: 'i1', name: 'Gyoza', quantity: 1, price: 800, sharedByIds: ['m1', 'm2'] },
      { id: 'i2', name: 'Matcha', quantity: 1, price: 500, sharedByIds: ['m2'] },
    ],
    tax: 130,
    tip: 0,
    discount: 0,
    taxTipMode: 'proportional',
    members: MEMBERS,
  });

  assert.equal(expenseData.splitType, 'exact');
  assert.equal(expenseData.amount, 1430);
  assert.deepEqual(expenseData.participantIds, ['m1', 'm2']);
  assert.equal(expenseData.splitValues?.m1, 440);
  assert.equal(expenseData.splitValues?.m2, 990);
  assert.equal(expenseData.receiptBreakdown?.items.length, 2);
});
