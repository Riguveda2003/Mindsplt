import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EXCHANGE_RATES,
  convertAmount,
  formatCurrency,
  getCrossRate,
} from './currency';
import {
  applyTripMembersUpdate,
  calculateDailySpendSeries,
  calculateDirectPairwiseTransfers,
  calculateExpenseSharesHome,
  calculateMemberSpendSeries,
  calculateMemberSummaries,
  calculateSimplifiedTransfers,
  calculateTotalUnsettledHome,
  calculateTripTotalSpendHome,
} from './ledger';
import { createInitialState, migratePersistedState } from './storage';
import type { Expense, Trip } from '../types';

test('converts across INR, USD, EUR, and JPY accurately with currency-specific decimals', () => {
  // 15,200 JPY -> 100.00 USD at default 152.00 JPY/USD
  assert.equal(convertAmount(15200, 'JPY', 'USD', DEFAULT_EXCHANGE_RATES), 100);
  // 100 USD -> 8,450.00 INR
  assert.equal(convertAmount(100, 'USD', 'INR', DEFAULT_EXCHANGE_RATES), 8450);
  // 100 USD -> 15,200 JPY (0 decimal places)
  assert.equal(convertAmount(100, 'USD', 'JPY', DEFAULT_EXCHANGE_RATES), 15200);
  // 92 EUR -> 100 USD -> 15,200 JPY
  assert.equal(convertAmount(92, 'EUR', 'JPY', DEFAULT_EXCHANGE_RATES), 15200);
  // Cross-rate identity
  assert.equal(getCrossRate('EUR', 'EUR', DEFAULT_EXCHANGE_RATES), 1);
  // Formatting JPY omits decimals, USD includes 2 decimals
  assert.equal(formatCurrency(24800, 'JPY'), '¥24,800');
  assert.equal(formatCurrency(100, 'USD', { showCode: true }), '$100.00 USD');
});

test('distributes multi-currency expense shares exactly to sum to converted total', () => {
  const expense: Expense = {
    id: 'e1',
    title: 'Sushi Lunch',
    amount: 10000,
    currency: 'JPY',
    paidById: 'a',
    participantIds: ['a', 'b', 'c'],
    splitType: 'equal',
    category: 'Food & Dining',
    date: '2026-11-10',
    createdAt: '2026-11-10T12:00:00Z',
  };

  // 10000 / 152 = 65.79 USD
  const sharesUsd = calculateExpenseSharesHome(expense, 'USD', DEFAULT_EXCHANGE_RATES);
  const sumUsd = Object.values(sharesUsd).reduce((acc, v) => acc + v, 0);
  assert.equal(Math.round(sumUsd * 100), 6579);

  // When home currency is JPY, 10000 JPY split 3 ways = 3334 + 3333 + 3333
  const sharesJpy = calculateExpenseSharesHome(expense, 'JPY', DEFAULT_EXCHANGE_RATES);
  const sumJpy = Object.values(sharesJpy).reduce((acc, v) => acc + v, 0);
  assert.equal(sumJpy, 10000);
});

test('supports exact and weighted shares split types in foreign currencies', () => {
  const exactExpense: Expense = {
    id: 'e-exact',
    title: 'Hotel Room Upgrades',
    amount: 200,
    currency: 'EUR',
    paidById: 'a',
    participantIds: ['a', 'b'],
    splitType: 'exact',
    splitValues: { a: 50, b: 150 },
    category: 'Stay & Lodging',
    date: '2026-11-10',
    createdAt: '2026-11-10T12:00:00Z',
  };

  // 200 EUR -> 217.39 USD (25% / 75%)
  const shares = calculateExpenseSharesHome(exactExpense, 'USD', DEFAULT_EXCHANGE_RATES);
  assert.ok(shares.b > shares.a * 2.9 && shares.b < shares.a * 3.1);
  assert.equal(Math.round((shares.a + shares.b) * 100), 21739);
});

test('computes net balances, simplifies transfers, and updates on one-tap settled marks', () => {
  const trip: Trip = {
    id: 't1',
    name: 'Test Trip',
    homeCurrency: 'USD',
    members: [
      { id: 'a', name: 'Aarav', initials: 'AA', color: '#0f766e' },
      { id: 'b', name: 'Maya', initials: 'MA', color: '#1d4ed8' },
      { id: 'c', name: 'Liam', initials: 'LI', color: '#b45309' },
    ],
    expenses: [
      {
        id: 'e1',
        title: 'Train',
        amount: 15200, // 100 USD
        currency: 'JPY',
        paidById: 'a',
        participantIds: ['a', 'b'],
        splitType: 'equal',
        category: 'Transport',
        date: '2026-11-10',
        createdAt: '2026-11-10T10:00:00Z',
      },
      {
        id: 'e2',
        title: 'Dinner',
        amount: 8450, // 100 USD
        currency: 'INR',
        paidById: 'a',
        participantIds: ['a', 'c'],
        splitType: 'equal',
        category: 'Food & Dining',
        date: '2026-11-10',
        createdAt: '2026-11-10T20:00:00Z',
      },
    ],
    settlements: [],
    rates: { ...DEFAULT_EXCHANGE_RATES },
    createdAt: '2026-11-10T00:00:00Z',
  };

  assert.equal(calculateTripTotalSpendHome(trip), 200);

  const summariesBefore = calculateMemberSummaries(trip);
  const transfersBefore = calculateSimplifiedTransfers(summariesBefore, 'USD');
  assert.equal(transfersBefore.length, 2);
  assert.equal(calculateTotalUnsettledHome(transfersBefore, 'USD'), 100);

  // Mark Maya -> Aarav ($50) as Settled
  const tripWithSettlement: Trip = {
    ...trip,
    settlements: [
      {
        id: 's1',
        fromId: 'b',
        toId: 'a',
        amount: 50,
        currency: 'USD',
        settledAt: '2026-11-11T09:00:00Z',
      },
    ],
  };

  const summariesAfter = calculateMemberSummaries(tripWithSettlement);
  const mayaAfter = summariesAfter.find((s) => s.memberId === 'b')!;
  const aaravAfter = summariesAfter.find((s) => s.memberId === 'a')!;
  assert.equal(mayaAfter.netBalanceHome, 0);
  assert.equal(aaravAfter.netBalanceHome, 50);

  const transfersAfter = calculateSimplifiedTransfers(summariesAfter, 'USD');
  assert.equal(transfersAfter.length, 1);
  assert.equal(transfersAfter[0].fromId, 'c');
  assert.equal(transfersAfter[0].toId, 'a');
  assert.equal(transfersAfter[0].amountHome, 50);

  // Switch home currency to INR: remaining 50 USD becomes 4225 INR
  const tripInInr: Trip = { ...tripWithSettlement, homeCurrency: 'INR' };
  const inrSummaries = calculateMemberSummaries(tripInInr);
  const inrTransfers = calculateSimplifiedTransfers(inrSummaries, 'INR');
  assert.equal(inrTransfers.length, 1);
  assert.equal(inrTransfers[0].amountHome, 4225);
});

test('migrates legacy localStorage shapes safely without losing expenses or members', () => {
  const legacySingleTrip = {
    name: 'Legacy Europe Trip',
    members: [
      { id: '1', name: 'Sam' },
      { id: '2', name: 'Alex' },
    ],
    expenses: [
      {
        id: 'e-old',
        title: 'Museum Tickets',
        amount: 40,
        paidById: '1',
        participantIds: ['1', '2'],
      },
    ],
  };

  const migrated = migratePersistedState(legacySingleTrip);
  assert.ok(migrated);
  assert.equal(migrated.trips.length, 1);
  assert.equal(migrated.trips[0].homeCurrency, 'USD');
  assert.equal(migrated.trips[0].expenses[0].currency, 'USD');
  assert.equal(migrated.trips[0].settlements.length, 0);

  // Seed data sanity check
  const seed = createInitialState();
  assert.equal(seed.trips.length, 2);
  assert.equal(seed.trips[0].homeCurrency, 'USD');
  assert.equal(seed.trips[1].homeCurrency, 'INR');
});

test('computes direct pairwise suggestive payments with per-bill breakdowns and settled offsets', () => {
  const trip: Trip = {
    id: 't-pair',
    name: 'Pairwise Test',
    homeCurrency: 'USD',
    members: [
      { id: 'a', name: 'Aarav', initials: 'AA', color: '#0f766e' },
      { id: 'b', name: 'Maya', initials: 'MA', color: '#1d4ed8' },
      { id: 'c', name: 'Liam', initials: 'LI', color: '#b45309' },
    ],
    expenses: [
      {
        id: 'e1',
        title: 'Hotel',
        amount: 300,
        currency: 'USD',
        paidById: 'a',
        participantIds: ['a', 'b', 'c'],
        splitType: 'equal',
        category: 'Stay & Lodging',
        date: '2026-11-08',
        createdAt: '2026-11-08T10:00:00Z',
      },
      {
        id: 'e2',
        title: 'Taxi',
        amount: 60,
        currency: 'USD',
        paidById: 'b',
        participantIds: ['a', 'b'],
        splitType: 'equal',
        category: 'Transport',
        date: '2026-11-09',
        createdAt: '2026-11-09T10:00:00Z',
      },
    ],
    settlements: [],
    rates: { ...DEFAULT_EXCHANGE_RATES },
    createdAt: '2026-11-08T00:00:00Z',
  };

  // Aarav paid $300 (Maya owes $100, Liam owes $100).
  // Maya paid $60 for Aarav & Maya (Aarav owes Maya $30).
  // Direct pairs: Liam -> Aarav ($100), Maya -> Aarav ($70 net).
  const direct = calculateDirectPairwiseTransfers(trip);
  assert.equal(direct.length, 2);
  assert.equal(direct[0].fromId, 'c');
  assert.equal(direct[0].toId, 'a');
  assert.equal(direct[0].amountHome, 100);
  assert.equal(direct[1].fromId, 'b');
  assert.equal(direct[1].toId, 'a');
  assert.equal(direct[1].amountHome, 70);
  assert.equal(direct[1].billItems.length, 2);

  // Mark Maya -> Aarav ($70) as settled: only Liam -> Aarav ($100) remains
  const afterSettled: Trip = {
    ...trip,
    settlements: [
      {
        id: 's1',
        fromId: 'b',
        toId: 'a',
        amount: 70,
        currency: 'USD',
        settledAt: '2026-11-10T00:00:00Z',
      },
    ],
  };
  const directAfter = calculateDirectPairwiseTransfers(afterSettled);
  assert.equal(directAfter.length, 1);
  assert.equal(directAfter[0].fromId, 'c');
  assert.equal(directAfter[0].amountHome, 100);
});

test('aggregates daily spending trends and per-member paid vs share series in home currency', () => {
  const seed = createInitialState();
  const kyoto = seed.trips[0];

  const dailyUsd = calculateDailySpendSeries(kyoto);
  assert.equal(dailyUsd.length, 4);
  // Chronological order: 2026-11-08, 09, 10, 11
  assert.equal(dailyUsd[0].date, '2026-11-08');
  assert.equal(dailyUsd[3].date, '2026-11-11');
  // 2026-11-10 has 2 bills (Kaiseki 24800 JPY + eSIM 64 EUR)
  assert.equal(dailyUsd[2].billCount, 2);

  const memberUsd = calculateMemberSpendSeries(kyoto);
  assert.equal(memberUsd.length, 4);
  const totalPaid = memberUsd.reduce((sum, m) => sum + m.paidHome, 0);
  const totalShare = memberUsd.reduce((sum, m) => sum + m.shareHome, 0);
  assert.ok(Math.abs(totalPaid - totalShare) < 0.05);

  // Switch home currency to JPY and verify scaling
  const kyotoJpy = { ...kyoto, homeCurrency: 'JPY' as const };
  const dailyJpy = calculateDailySpendSeries(kyotoJpy);
  assert.equal(dailyJpy[0].totalHome, 96000);
});

test('updates group member count on an existing trip while keeping expenses and balances valid', () => {
  const seed = createInitialState();
  const kyoto = seed.trips[0];

  // Add a 5th member to an already-created trip
  const expanded = applyTripMembersUpdate(kyoto, [
    ...kyoto.members,
    { id: 'm-kenji', name: 'Kenji Sato', initials: 'KS', color: '#0369a1' },
  ]);
  assert.equal(expanded.members.length, 5);
  assert.equal(calculateMemberSummaries(expanded).length, 5);

  // Shrink group size by removing Sofia (who paid eSIM bundle) and verify payer/participants stay valid
  const shrunk = applyTripMembersUpdate(
    expanded,
    expanded.members.filter((m) => m.id !== 'm-sofia')
  );
  assert.equal(shrunk.members.length, 4);
  for (const exp of shrunk.expenses) {
    assert.ok(shrunk.members.some((m) => m.id === exp.paidById));
    assert.ok(exp.participantIds.length >= 1);
    assert.ok(!exp.participantIds.includes('m-sofia'));
  }
});



