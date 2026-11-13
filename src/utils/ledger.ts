import type {
  CurrencyCode,
  DirectTransferSuggestion,
  ExchangeRates,
  Expense,
  Member,
  MemberSummary,
  PairwiseBillItem,
  TransferSuggestion,
  Trip,
} from '../types';
import {
  CURRENCY_META,
  DEFAULT_EXCHANGE_RATES,
  convertAmount,
  getSmallestUnit,
  roundToCurrency,
} from './currency';

/**
 * Distributes `total` across `participantIds` according to weights so that the
 * rounded shares sum exactly to `roundToCurrency(total, currency)`.
 */
function distributeByWeights(
  total: number,
  participantIds: string[],
  weights: number[],
  currency: CurrencyCode
): Record<string, number> {
  const result: Record<string, number> = {};
  if (participantIds.length === 0) return result;

  const decimals = CURRENCY_META[currency].decimals;
  const factor = Math.pow(10, decimals);
  const totalUnits = Math.round(total * factor);

  const weightSum = weights.reduce((acc, w) => acc + (w > 0 ? w : 0), 0);
  if (weightSum <= 0) {
    // Fallback to equal split if weights are invalid
    return distributeByWeights(
      total,
      participantIds,
      participantIds.map(() => 1),
      currency
    );
  }

  const rawUnits = weights.map((w) => (totalUnits * Math.max(0, w)) / weightSum);
  const flooredUnits = rawUnits.map((u) => Math.floor(u));
  let remainder = totalUnits - flooredUnits.reduce((acc, u) => acc + u, 0);

  // Largest remainder method for deterministic exact sum
  const order = rawUnits
    .map((u, idx) => ({ idx, frac: u - flooredUnits[idx] }))
    .sort((a, b) => b.frac - a.frac);

  for (let i = 0; i < order.length && remainder > 0; i++) {
    flooredUnits[order[i].idx] += 1;
    remainder -= 1;
  }

  participantIds.forEach((id, idx) => {
    result[id] = flooredUnits[idx] / factor;
  });

  return result;
}

export function getExpenseConvertedTotal(
  expense: Expense,
  homeCurrency: CurrencyCode,
  rates: ExchangeRates = DEFAULT_EXCHANGE_RATES
): number {
  return convertAmount(expense.amount, expense.currency, homeCurrency, rates);
}

/**
 * Calculates each participant's share of an expense in the trip's home currency.
 * Guarantees that the sum of shares matches the converted expense total in home currency.
 */
export function calculateExpenseSharesHome(
  expense: Expense,
  homeCurrency: CurrencyCode,
  rates: ExchangeRates = DEFAULT_EXCHANGE_RATES
): Record<string, number> {
  const participants = expense.participantIds;
  if (participants.length === 0) return {};

  const convertedTotal = getExpenseConvertedTotal(expense, homeCurrency, rates);

  if (expense.splitType === 'exact' && expense.splitValues) {
    const weights = participants.map((id) =>
      Math.max(0, expense.splitValues?.[id] ?? 0)
    );
    const exactSum = weights.reduce((acc, v) => acc + v, 0);
    if (exactSum > 0) {
      return distributeByWeights(convertedTotal, participants, weights, homeCurrency);
    }
  }

  if (expense.splitType === 'shares' && expense.splitValues) {
    const weights = participants.map((id) =>
      Math.max(0, expense.splitValues?.[id] ?? 1)
    );
    return distributeByWeights(convertedTotal, participants, weights, homeCurrency);
  }

  // Equal split
  const equalWeights = participants.map(() => 1);
  return distributeByWeights(convertedTotal, participants, equalWeights, homeCurrency);
}

export function calculateMemberSummaries(
  trip: Trip,
  overrideRates?: ExchangeRates
): MemberSummary[] {
  const rates = overrideRates ?? trip.rates ?? DEFAULT_EXCHANGE_RATES;
  const home = trip.homeCurrency;
  const memberIds = new Set(trip.members.map((m) => m.id));

  const paidMap: Record<string, number> = {};
  const shareMap: Record<string, number> = {};
  const settledAdjMap: Record<string, number> = {};

  for (const m of trip.members) {
    paidMap[m.id] = 0;
    shareMap[m.id] = 0;
    settledAdjMap[m.id] = 0;
  }

  for (const exp of trip.expenses) {
    const convertedTotal = getExpenseConvertedTotal(exp, home, rates);
    if (memberIds.has(exp.paidById)) {
      paidMap[exp.paidById] = roundToCurrency(
        paidMap[exp.paidById] + convertedTotal,
        home
      );
    }

    const validParticipants = exp.participantIds.filter((id) => memberIds.has(id));
    if (validParticipants.length > 0) {
      const shares = calculateExpenseSharesHome(
        { ...exp, participantIds: validParticipants },
        home,
        rates
      );
      for (const [pid, share] of Object.entries(shares)) {
        shareMap[pid] = roundToCurrency((shareMap[pid] ?? 0) + share, home);
      }
    }
  }

  for (const settlement of trip.settlements) {
    if (!memberIds.has(settlement.fromId) || !memberIds.has(settlement.toId)) {
      continue;
    }
    const convertedSettlement = convertAmount(
      settlement.amount,
      settlement.currency,
      home,
      rates
    );
    // Debtor paid creditor: debtor's net rises (+), creditor's net drops (-)
    settledAdjMap[settlement.fromId] = roundToCurrency(
      settledAdjMap[settlement.fromId] + convertedSettlement,
      home
    );
    settledAdjMap[settlement.toId] = roundToCurrency(
      settledAdjMap[settlement.toId] - convertedSettlement,
      home
    );
  }

  return trip.members.map((m) => {
    const totalPaidHome = roundToCurrency(paidMap[m.id] ?? 0, home);
    const totalShareHome = roundToCurrency(shareMap[m.id] ?? 0, home);
    const rawNetHome = roundToCurrency(totalPaidHome - totalShareHome, home);
    const settledAdjustmentHome = roundToCurrency(settledAdjMap[m.id] ?? 0, home);
    const netBalanceHome = roundToCurrency(rawNetHome + settledAdjustmentHome, home);

    return {
      memberId: m.id,
      totalPaidHome,
      totalShareHome,
      rawNetHome,
      settledAdjustmentHome,
      netBalanceHome,
    };
  });
}

/**
 * Computes minimal set of transfers to settle all remaining non-zero balances.
 */
export function calculateSimplifiedTransfers(
  summaries: MemberSummary[],
  homeCurrency: CurrencyCode
): TransferSuggestion[] {
  const epsilon = getSmallestUnit(homeCurrency) * 0.5;

  const debtors = summaries
    .filter((s) => s.netBalanceHome < -epsilon)
    .map((s) => ({ memberId: s.memberId, remaining: Math.abs(s.netBalanceHome) }))
    .sort((a, b) => b.remaining - a.remaining);

  const creditors = summaries
    .filter((s) => s.netBalanceHome > epsilon)
    .map((s) => ({ memberId: s.memberId, remaining: s.netBalanceHome }))
    .sort((a, b) => b.remaining - a.remaining);

  const transfers: TransferSuggestion[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const payAmount = roundToCurrency(
      Math.min(debtor.remaining, creditor.remaining),
      homeCurrency
    );

    if (payAmount >= getSmallestUnit(homeCurrency)) {
      transfers.push({
        id: `${debtor.memberId}__${creditor.memberId}`,
        fromId: debtor.memberId,
        toId: creditor.memberId,
        amountHome: payAmount,
      });
    }

    debtor.remaining = roundToCurrency(debtor.remaining - payAmount, homeCurrency);
    creditor.remaining = roundToCurrency(creditor.remaining - payAmount, homeCurrency);

    if (debtor.remaining <= epsilon) i++;
    if (creditor.remaining <= epsilon) j++;
  }

  return transfers;
}

export function calculateTripTotalSpendHome(
  trip: Trip,
  overrideRates?: ExchangeRates
): number {
  const rates = overrideRates ?? trip.rates ?? DEFAULT_EXCHANGE_RATES;
  const total = trip.expenses.reduce(
    (sum, exp) => sum + getExpenseConvertedTotal(exp, trip.homeCurrency, rates),
    0
  );
  return roundToCurrency(total, trip.homeCurrency);
}

export function calculateTotalUnsettledHome(
  transfers: TransferSuggestion[],
  homeCurrency: CurrencyCode
): number {
  const total = transfers.reduce((sum, t) => sum + t.amountHome, 0);
  return roundToCurrency(total, homeCurrency);
}

/**
 * Computes direct pairwise suggestive payments between every two travelers
 * based on the bills they shared, adjusted by any settled marks between them.
 */
export function calculateDirectPairwiseTransfers(
  trip: Trip,
  overrideRates?: ExchangeRates
): DirectTransferSuggestion[] {
  const rates = overrideRates ?? trip.rates ?? DEFAULT_EXCHANGE_RATES;
  const home = trip.homeCurrency;
  const memberIds = new Set(trip.members.map((m) => m.id));
  const epsilon = getSmallestUnit(home) * 0.5;

  // Keyed by sorted pair `${a}::${b}` where positive net means `a` owes `b`.
  const pairMap = new Map<
    string,
    {
      a: string;
      b: string;
      netAOwesB: number;
      settledOffsetAOwesB: number;
      items: Array<{
        expenseId: string;
        title: string;
        date: string;
        originalAmount: number;
        originalCurrency: CurrencyCode;
        shareHome: number;
        aOwesB: boolean;
      }>;
    }
  >();

  const getOrCreatePair = (id1: string, id2: string) => {
    const [a, b] = id1 < id2 ? [id1, id2] : [id2, id1];
    const key = `${a}::${b}`;
    let entry = pairMap.get(key);
    if (!entry) {
      entry = {
        a,
        b,
        netAOwesB: 0,
        settledOffsetAOwesB: 0,
        items: [],
      };
      pairMap.set(key, entry);
    }
    return entry;
  };

  for (const exp of trip.expenses) {
    if (!memberIds.has(exp.paidById)) continue;
    const validParticipants = exp.participantIds.filter((id) => memberIds.has(id));
    if (validParticipants.length === 0) continue;

    const shares = calculateExpenseSharesHome(
      { ...exp, participantIds: validParticipants },
      home,
      rates
    );

    for (const [pid, share] of Object.entries(shares)) {
      if (pid === exp.paidById || share <= epsilon) continue;
      const pair = getOrCreatePair(pid, exp.paidById);
      const pidIsA = pid === pair.a;
      pair.netAOwesB = roundToCurrency(
        pair.netAOwesB + (pidIsA ? share : -share),
        home
      );
      pair.items.push({
        expenseId: exp.id,
        title: exp.title,
        date: exp.date,
        originalAmount: exp.amount,
        originalCurrency: exp.currency,
        shareHome: share,
        aOwesB: pidIsA,
      });
    }
  }

  for (const s of trip.settlements) {
    if (!memberIds.has(s.fromId) || !memberIds.has(s.toId) || s.fromId === s.toId) {
      continue;
    }
    const amt = convertAmount(s.amount, s.currency, home, rates);
    const pair = getOrCreatePair(s.fromId, s.toId);
    const fromIsA = s.fromId === pair.a;
    // If A paid B, A's debt to B decreases (-amt). If B paid A, A's debt to B increases (+amt).
    const delta = fromIsA ? -amt : amt;
    pair.netAOwesB = roundToCurrency(pair.netAOwesB + delta, home);
    pair.settledOffsetAOwesB = roundToCurrency(
      pair.settledOffsetAOwesB + delta,
      home
    );
  }

  const results: DirectTransferSuggestion[] = [];
  for (const pair of pairMap.values()) {
    if (Math.abs(pair.netAOwesB) < getSmallestUnit(home)) continue;
    const aOwesB = pair.netAOwesB > 0;
    const fromId = aOwesB ? pair.a : pair.b;
    const toId = aOwesB ? pair.b : pair.a;
    const amountHome = roundToCurrency(Math.abs(pair.netAOwesB), home);

    const billItems: PairwiseBillItem[] = pair.items
      .map((item) => ({
        expenseId: item.expenseId,
        title: item.title,
        date: item.date,
        originalAmount: item.originalAmount,
        originalCurrency: item.originalCurrency,
        shareHome: item.shareHome,
        direction: (item.aOwesB === aOwesB
          ? 'from_owes_to'
          : 'to_owes_from') as PairwiseBillItem['direction'],
      }))
      .sort((x, y) => y.date.localeCompare(x.date));

    results.push({
      id: `${fromId}__${toId}`,
      fromId,
      toId,
      amountHome,
      billItems,
      settledOffsetHome: aOwesB
        ? pair.settledOffsetAOwesB
        : -pair.settledOffsetAOwesB,
    });
  }

  return results.sort((x, y) => y.amountHome - x.amountHome);
}

export interface DailySpendPoint {
  date: string;
  label: string;
  totalHome: number;
  billCount: number;
}

export interface MemberSpendPoint {
  memberId: string;
  name: string;
  shortName: string;
  paidHome: number;
  shareHome: number;
}

export function calculateDailySpendSeries(
  trip: Trip,
  overrideRates?: ExchangeRates
): DailySpendPoint[] {
  const rates = overrideRates ?? trip.rates ?? DEFAULT_EXCHANGE_RATES;
  const home = trip.homeCurrency;
  const byDate = new Map<string, { total: number; count: number }>();

  for (const exp of trip.expenses) {
    const converted = getExpenseConvertedTotal(exp, home, rates);
    const existing = byDate.get(exp.date) ?? { total: 0, count: 0 };
    byDate.set(exp.date, {
      total: roundToCurrency(existing.total + converted, home),
      count: existing.count + 1,
    });
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, stats]) => ({
      date,
      label: date.length >= 10 ? date.slice(5) : date,
      totalHome: stats.total,
      billCount: stats.count,
    }));
}

export function calculateMemberSpendSeries(
  trip: Trip,
  overrideRates?: ExchangeRates
): MemberSpendPoint[] {
  const summaries = calculateMemberSummaries(trip, overrideRates);
  const memberMap = new Map(trip.members.map((m) => [m.id, m]));

  return summaries.map((s) => {
    const member = memberMap.get(s.memberId);
    const fullName = member?.name ?? 'Member';
    const shortName = fullName.split(/\s+/)[0] || fullName;
    return {
      memberId: s.memberId,
      name: fullName,
      shortName,
      paidHome: s.totalPaidHome,
      shareHome: s.totalShareHome,
    };
  });
}

/**
 * Updates the member list of an already-created trip (adding, renaming, or removing
 * members) while keeping all existing expenses and settlements valid and balanced.
 */
export function applyTripMembersUpdate(trip: Trip, nextMembers: Member[]): Trip {
  if (nextMembers.length < 2) {
    return trip;
  }

  const nextIdSet = new Set(nextMembers.map((m) => m.id));
  const fallbackMemberId = nextMembers[0].id;

  const updatedExpenses = trip.expenses.map((exp) => {
    const paidById = nextIdSet.has(exp.paidById) ? exp.paidById : fallbackMemberId;
    const filteredParticipants = exp.participantIds.filter((id) => nextIdSet.has(id));
    const participantIds =
      filteredParticipants.length > 0
        ? filteredParticipants
        : nextMembers.map((m) => m.id);

    let splitValues = exp.splitValues;
    if (splitValues) {
      const cleaned: Record<string, number> = {};
      for (const pid of participantIds) {
        if (splitValues[pid] !== undefined) {
          cleaned[pid] = splitValues[pid];
        }
      }
      splitValues = cleaned;
    }

    let receiptBreakdown = exp.receiptBreakdown;
    if (receiptBreakdown && Array.isArray(receiptBreakdown.items)) {
      receiptBreakdown = {
        ...receiptBreakdown,
        items: receiptBreakdown.items.map((item) => ({
          ...item,
          sharedByIds: item.sharedByIds.filter((id) => nextIdSet.has(id)),
        })),
      };
    }

    return {
      ...exp,
      paidById,
      participantIds,
      splitValues,
      receiptBreakdown,
    };
  });

  const updatedSettlements = trip.settlements.filter(
    (s) => nextIdSet.has(s.fromId) && nextIdSet.has(s.toId) && s.fromId !== s.toId
  );

  return {
    ...trip,
    members: nextMembers,
    expenses: updatedExpenses,
    settlements: updatedSettlements,
  };
}



