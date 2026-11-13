import type { Trip } from '../types';
import {
  CURRENCY_META,
  DEFAULT_EXCHANGE_RATES,
  convertAmount,
} from './currency';
import { getExpenseConvertedTotal } from './ledger';

export function escapeCsvCell(value: string | number | undefined | null): string {
  const str = value === undefined || value === null ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvFilename(tripName: string): string {
  const slug = tripName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'mindsplt-trip'}-ledger.csv`;
}

export function generateTripCsv(trip: Trip): string {
  const rates = trip.rates ?? DEFAULT_EXCHANGE_RATES;
  const home = trip.homeCurrency;
  const homeDecimals = CURRENCY_META[home].decimals;
  const memberMap = new Map(trip.members.map((m) => [m.id, m.name]));

  const headers = [
    'Record Type',
    'Date',
    'Description',
    'Category',
    'Paid By / From',
    'Participants / To',
    'Split Type',
    'Original Amount',
    'Original Currency',
    `Converted Amount (${home})`,
    'Home Currency',
    'Notes',
  ];

  const rows: string[][] = [headers];

  const sortedExpenses = [...trip.expenses].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
  );

  for (const exp of sortedExpenses) {
    const payerName = memberMap.get(exp.paidById) ?? exp.paidById;
    const participantNames = exp.participantIds
      .map((id) => memberMap.get(id) ?? id)
      .join(', ');
    const origDecimals = CURRENCY_META[exp.currency].decimals;
    const convertedHome = getExpenseConvertedTotal(exp, home, rates);

    rows.push([
      'Expense',
      exp.date,
      exp.title,
      exp.category,
      payerName,
      participantNames,
      exp.splitType,
      exp.amount.toFixed(origDecimals),
      exp.currency,
      convertedHome.toFixed(homeDecimals),
      home,
      exp.notes ?? '',
    ]);
  }

  const sortedSettlements = [...trip.settlements].sort((a, b) =>
    b.settledAt.localeCompare(a.settledAt)
  );

  for (const settlement of sortedSettlements) {
    const fromName = memberMap.get(settlement.fromId) ?? settlement.fromId;
    const toName = memberMap.get(settlement.toId) ?? settlement.toId;
    const origDecimals = CURRENCY_META[settlement.currency].decimals;
    const convertedHome = convertAmount(
      settlement.amount,
      settlement.currency,
      home,
      rates
    );

    rows.push([
      'Settlement',
      settlement.settledAt.slice(0, 10),
      `${fromName} settled with ${toName}`,
      'Settlement',
      fromName,
      toName,
      'settled',
      settlement.amount.toFixed(origDecimals),
      settlement.currency,
      convertedHome.toFixed(homeDecimals),
      home,
      `Settled at ${settlement.settledAt}`,
    ]);
  }

  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

export function downloadTripCsv(trip: Trip): string {
  const csv = generateTripCsv(trip);
  const filename = buildCsvFilename(trip.name);

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return filename;
}
