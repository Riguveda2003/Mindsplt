import type {
  CurrencyCode,
  Expense,
  ExpenseCategory,
  Member,
  ReceiptBreakdown,
  ReceiptLineItem,
  ReceiptTaxTipMode,
} from '../types';
import { CURRENCY_META, roundToCurrency } from './currency';

export interface MemberReceiptBreakdown {
  memberId: string;
  itemsSubtotal: number;
  taxShare: number;
  tipShare: number;
  discountShare: number;
  total: number;
  itemCount: number;
}

export interface ReceiptSplitCalculation {
  assignedItemsTotal: number;
  unassignedItemsTotal: number;
  unassignedItemIds: string[];
  tax: number;
  tip: number;
  discount: number;
  grandTotal: number;
  activeMemberIds: string[];
  perMember: Record<string, MemberReceiptBreakdown>;
  splitValues: Record<string, number>;
}

function toMinorUnits(amount: number, currency: CurrencyCode): number {
  const decimals = CURRENCY_META[currency].decimals;
  const factor = Math.pow(10, decimals);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round((amount + Number.EPSILON) * factor);
}

function fromMinorUnits(units: number, currency: CurrencyCode): number {
  const decimals = CURRENCY_META[currency].decimals;
  const factor = Math.pow(10, decimals);
  return roundToCurrency(units / factor, currency);
}

/**
 * Distributes integer minor units across indices proportionally to weights
 * using the largest-remainder method so the sum equals `totalUnits`.
 */
function distributeMinorUnits(totalUnits: number, weights: number[]): number[] {
  const count = weights.length;
  if (count === 0) return [];
  if (totalUnits <= 0) return new Array(count).fill(0);

  const sanitizedWeights = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const weightSum = sanitizedWeights.reduce((acc, w) => acc + w, 0);

  if (weightSum <= 0) {
    return distributeMinorUnits(
      totalUnits,
      new Array(count).fill(1)
    );
  }

  const raw = sanitizedWeights.map((w) => (totalUnits * w) / weightSum);
  const floored = raw.map((val) => Math.floor(val));
  let remainder = totalUnits - floored.reduce((acc, u) => acc + u, 0);

  const order = raw
    .map((val, idx) => ({ idx, frac: val - floored[idx] }))
    .sort((a, b) => b.frac - a.frac);

  for (let i = 0; i < order.length && remainder > 0; i++) {
    floored[order[i].idx] += 1;
    remainder -= 1;
  }

  return floored;
}

export function calculateReceiptSplit({
  items,
  tax,
  tip,
  discount = 0,
  taxTipMode,
  currency,
  members,
}: {
  items: ReceiptLineItem[];
  tax: number;
  tip: number;
  discount?: number;
  taxTipMode: ReceiptTaxTipMode;
  currency: CurrencyCode;
  members: Member[];
}): ReceiptSplitCalculation {
  const validMemberIds = new Set(members.map((m) => m.id));

  const itemUnitsByMember: Record<string, number> = {};
  const itemCountByMember: Record<string, number> = {};
  members.forEach((m) => {
    itemUnitsByMember[m.id] = 0;
    itemCountByMember[m.id] = 0;
  });

  let assignedUnitsTotal = 0;
  let unassignedUnitsTotal = 0;
  const unassignedItemIds: string[] = [];

  for (const item of items) {
    const priceUnits = toMinorUnits(item.price, currency);
    const shared = item.sharedByIds.filter((id) => validMemberIds.has(id));

    if (shared.length === 0) {
      if (priceUnits > 0) {
        unassignedItemIds.push(item.id);
        unassignedUnitsTotal += priceUnits;
      }
      continue;
    }

    assignedUnitsTotal += priceUnits;
    const perPerson = distributeMinorUnits(
      priceUnits,
      shared.map(() => 1)
    );
    shared.forEach((memberId, idx) => {
      itemUnitsByMember[memberId] = (itemUnitsByMember[memberId] ?? 0) + perPerson[idx];
      itemCountByMember[memberId] = (itemCountByMember[memberId] ?? 0) + 1;
    });
  }

  const activeMemberIds = members
    .map((m) => m.id)
    .filter(
      (id) => (itemUnitsByMember[id] ?? 0) > 0 || (itemCountByMember[id] ?? 0) > 0
    );

  const taxUnits = toMinorUnits(tax, currency);
  const tipUnits = toMinorUnits(tip, currency);
  const rawDiscountUnits = toMinorUnits(discount, currency);

  const taxUnitsByMember: Record<string, number> = {};
  const tipUnitsByMember: Record<string, number> = {};
  const discountUnitsByMember: Record<string, number> = {};
  members.forEach((m) => {
    taxUnitsByMember[m.id] = 0;
    tipUnitsByMember[m.id] = 0;
    discountUnitsByMember[m.id] = 0;
  });

  if (activeMemberIds.length > 0) {
    const baseWeights = activeMemberIds.map((id) =>
      taxTipMode === 'proportional' ? Math.max(0, itemUnitsByMember[id] ?? 0) : 1
    );
    const weightSum = baseWeights.reduce((acc, w) => acc + w, 0);
    const effectiveWeights =
      weightSum > 0 ? baseWeights : activeMemberIds.map(() => 1);

    const taxShares = distributeMinorUnits(taxUnits, effectiveWeights);
    const tipShares = distributeMinorUnits(tipUnits, effectiveWeights);

    activeMemberIds.forEach((id, idx) => {
      taxUnitsByMember[id] = taxShares[idx];
      tipUnitsByMember[id] = tipShares[idx];
    });

    const grossBeforeDiscount = assignedUnitsTotal + taxUnits + tipUnits;
    const appliedDiscountUnits = Math.min(rawDiscountUnits, grossBeforeDiscount);
    const discountWeights = activeMemberIds.map(
      (id) =>
        (itemUnitsByMember[id] ?? 0) +
        (taxUnitsByMember[id] ?? 0) +
        (tipUnitsByMember[id] ?? 0)
    );
    const discountShares = distributeMinorUnits(
      appliedDiscountUnits,
      discountWeights
    );
    activeMemberIds.forEach((id, idx) => {
      discountUnitsByMember[id] = discountShares[idx];
    });
  }

  const perMember: Record<string, MemberReceiptBreakdown> = {};
  const splitValues: Record<string, number> = {};
  let grandTotalUnits = 0;

  for (const m of members) {
    const itemsUnits = itemUnitsByMember[m.id] ?? 0;
    const tUnits = taxUnitsByMember[m.id] ?? 0;
    const tipU = tipUnitsByMember[m.id] ?? 0;
    const dUnits = discountUnitsByMember[m.id] ?? 0;
    const totalUnits = Math.max(0, itemsUnits + tUnits + tipU - dUnits);
    grandTotalUnits += totalUnits;

    const totalAmt = fromMinorUnits(totalUnits, currency);
    perMember[m.id] = {
      memberId: m.id,
      itemsSubtotal: fromMinorUnits(itemsUnits, currency),
      taxShare: fromMinorUnits(tUnits, currency),
      tipShare: fromMinorUnits(tipU, currency),
      discountShare: fromMinorUnits(dUnits, currency),
      total: totalAmt,
      itemCount: itemCountByMember[m.id] ?? 0,
    };

    if (totalUnits > 0) {
      splitValues[m.id] = totalAmt;
    }
  }

  const effectiveDiscountUnits =
    activeMemberIds.length > 0
      ? Math.min(rawDiscountUnits, assignedUnitsTotal + taxUnits + tipUnits)
      : rawDiscountUnits;

  return {
    assignedItemsTotal: fromMinorUnits(assignedUnitsTotal, currency),
    unassignedItemsTotal: fromMinorUnits(unassignedUnitsTotal, currency),
    unassignedItemIds,
    tax: fromMinorUnits(taxUnits, currency),
    tip: fromMinorUnits(tipUnits, currency),
    discount: fromMinorUnits(effectiveDiscountUnits, currency),
    grandTotal: fromMinorUnits(grandTotalUnits, currency),
    activeMemberIds,
    perMember,
    splitValues,
  };
}

export function matchSuggestedMemberIds(
  suggestedNames: string[],
  members: Member[]
): string[] {
  if (!Array.isArray(suggestedNames) || suggestedNames.length === 0) return [];
  const matched = new Set<string>();

  for (const rawName of suggestedNames) {
    const q = rawName.trim().toLowerCase();
    if (!q) continue;
    if (q === 'all' || q === 'everyone' || q === 'group') {
      members.forEach((m) => matched.add(m.id));
      continue;
    }

    for (const m of members) {
      const full = m.name.trim().toLowerCase();
      const first = full.split(/\s+/)[0] ?? '';
      if (
        full === q ||
        first === q ||
        (q.length >= 2 && (full.includes(q) || first.startsWith(q)))
      ) {
        matched.add(m.id);
      }
    }
  }

  return Array.from(matched);
}

export function matchPaidByMemberId(
  paidByName: string,
  members: Member[],
  fallbackId: string
): string {
  const q = paidByName.trim().toLowerCase();
  if (!q) return fallbackId;
  const exact = members.find((m) => m.name.trim().toLowerCase() === q);
  if (exact) return exact.id;
  const firstMatch = members.find((m) => {
    const full = m.name.trim().toLowerCase();
    const first = full.split(/\s+/)[0] ?? '';
    return first === q || full.includes(q);
  });
  return firstMatch?.id ?? fallbackId;
}

export function buildExpenseFromReceipt({
  title,
  currency,
  paidById,
  category,
  date,
  notes,
  items,
  tax,
  tip,
  discount,
  taxTipMode,
  rawSourceText,
  members,
}: {
  title: string;
  currency: CurrencyCode;
  paidById: string;
  category: ExpenseCategory;
  date: string;
  notes?: string;
  items: ReceiptLineItem[];
  tax: number;
  tip: number;
  discount: number;
  taxTipMode: ReceiptTaxTipMode;
  rawSourceText?: string;
  members: Member[];
}): {
  expenseData: Omit<Expense, 'id' | 'createdAt'>;
  split: ReceiptSplitCalculation;
} {
  const split = calculateReceiptSplit({
    items,
    tax,
    tip,
    discount,
    taxTipMode,
    currency,
    members,
  });

  const participantIds = Object.keys(split.splitValues);
  const breakdown: ReceiptBreakdown = {
    items: items.map((it) => ({ ...it, sharedByIds: [...it.sharedByIds] })),
    tax: split.tax,
    tip: split.tip,
    discount: split.discount,
    taxTipMode,
    rawSourceText: rawSourceText?.trim() || undefined,
  };

  return {
    expenseData: {
      title: title.trim() || 'Shared Receipt',
      amount: split.grandTotal,
      currency,
      paidById,
      participantIds,
      splitType: 'exact',
      splitValues: split.splitValues,
      category,
      date,
      notes: notes?.trim() || undefined,
      receiptBreakdown: breakdown,
    },
    split,
  };
}

export interface SampleReceiptPreset {
  id: string;
  label: string;
  rawText: string;
}

export const SAMPLE_RECEIPTS: SampleReceiptPreset[] = [
  {
    id: 'izakaya-jpy',
    label: 'Izakaya Receipt (JPY)',
    rawText: [
      'TORIKIZOKU PONTOCHO KYOTO - 2026-11-11',
      'Edamame & Cabbage (all shared) ........ ¥680',
      '2x Yakitori Platter ................... ¥2,400',
      'Karaage Fried Chicken ................. ¥950',
      'Matcha Highball (Maya) ................ ¥720',
      'Yuzu Sour (Sofia & Liam) .............. ¥1,440',
      'Draft Beer (Aarav) .................... ¥650',
      'Subtotal ¥6,840',
      'Consumption Tax 10% ................... ¥684',
      'Table Service Charge .................. ¥800',
      'TOTAL ¥8,324 (paid by Aarav)',
    ].join('\n'),
  },
  {
    id: 'brunch-chat-usd',
    label: 'Messy Brunch Chat (USD)',
    rawText: [
      'hey guys here is the brunch breakdown from Sunday:',
      'avocado toast $16 (Maya), eggs benedict $19 (Liam),',
      'truffle fries $12 everyone shared, matcha latte $6.50 (Sofia),',
      '2x cold brew $11 (Aarav & Liam).',
      'tax was $5.81 and I left $12 tip. Total $82.31 - I paid!',
    ].join('\n'),
  },
  {
    id: 'shack-inr',
    label: 'Beach Shack Bill (INR)',
    rawText: [
      'CURLIES ANJUNA SHACK',
      'Garlic Butter Prawns ......... Rs 950',
      'Paneer Tikka Masala .......... Rs 520',
      '3x Butter Naan ............... Rs 270',
      '2x Fresh Lime Soda ........... Rs 240',
      'CGST + SGST (5%) ............. Rs 99',
      'Service Tip .................. Rs 200',
      'Grand Total: INR 2,279',
    ].join('\n'),
  },
];
