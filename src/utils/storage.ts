import type {
  AppState,
  CurrencyCode,
  Expense,
  Member,
  PaymentNotification,
  SettlementRecord,
  Trip,
} from '../types';
import { DEFAULT_EXCHANGE_RATES, SUPPORTED_CURRENCIES } from './currency';

export const STORAGE_KEY = 'mindsplt_state_v1';
const LEGACY_KEYS = ['mindsplt_data', 'mindsplt_trips', 'mindsplt'];

const AVATAR_PALETTE = [
  '#0f766e', // teal
  '#1d4ed8', // cobalt
  '#b45309', // amber
  '#7c3aed', // violet
  '#be123c', // rose
  '#0369a1', // sky
];

export function makeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function pickMemberColor(index: number): string {
  return AVATAR_PALETTE[index % AVATAR_PALETTE.length];
}

export function createInitialState(): AppState {
  const kyotoMembers: Member[] = [
    { id: 'm-aarav', name: 'Aarav Mehta', initials: 'AM', color: '#0f766e' },
    { id: 'm-maya', name: 'Maya Chen', initials: 'MC', color: '#1d4ed8' },
    { id: 'm-liam', name: 'Liam Patel', initials: 'LP', color: '#b45309' },
    { id: 'm-sofia', name: 'Sofia Rossi', initials: 'SR', color: '#7c3aed' },
  ];

  const kyotoExpenses: Expense[] = [
    {
      id: 'exp-ryokan',
      title: 'Gion Machiya Ryokan (3 Nights)',
      amount: 96000,
      currency: 'JPY',
      paidById: 'm-aarav',
      participantIds: ['m-aarav', 'm-maya', 'm-liam', 'm-sofia'],
      splitType: 'equal',
      category: 'Stay & Lodging',
      date: '2026-11-08',
      notes: 'Traditional stay near Hanamikoji Street',
      createdAt: '2026-11-08T14:20:00Z',
    },
    {
      id: 'exp-flights',
      title: 'Airport Express & JR West Passes',
      amount: 340,
      currency: 'USD',
      paidById: 'm-maya',
      participantIds: ['m-aarav', 'm-maya', 'm-liam', 'm-sofia'],
      splitType: 'equal',
      category: 'Transport',
      date: '2026-11-09',
      notes: 'Booked online for all 4 travelers',
      createdAt: '2026-11-09T09:10:00Z',
    },
    {
      id: 'exp-kaiseki',
      title: 'Pontocho Alley Kaiseki Dinner',
      amount: 24800,
      currency: 'JPY',
      paidById: 'm-liam',
      participantIds: ['m-aarav', 'm-maya', 'm-liam', 'm-sofia'],
      splitType: 'equal',
      category: 'Food & Dining',
      date: '2026-11-10',
      createdAt: '2026-11-10T20:45:00Z',
    },
    {
      id: 'exp-esim',
      title: 'Group Pocket Wi-Fi & eSIM Bundle',
      amount: 64,
      currency: 'EUR',
      paidById: 'm-sofia',
      participantIds: ['m-aarav', 'm-maya', 'm-liam', 'm-sofia'],
      splitType: 'equal',
      category: 'Other',
      date: '2026-11-10',
      createdAt: '2026-11-10T11:00:00Z',
    },
    {
      id: 'exp-matcha',
      title: 'Uji Tea Tasting & Snacks',
      amount: 4250,
      currency: 'INR',
      paidById: 'm-aarav',
      participantIds: ['m-aarav', 'm-maya', 'm-sofia'],
      splitType: 'equal',
      category: 'Food & Dining',
      date: '2026-11-11',
      notes: 'Liam skipped afternoon tea',
      createdAt: '2026-11-11T16:30:00Z',
    },
  ];

  const kyotoTrip: Trip = {
    id: 'trip-kyoto',
    name: 'Kyoto & Osaka Autumn',
    subtitle: '4 travelers · Multi-currency trip',
    homeCurrency: 'USD',
    members: kyotoMembers,
    expenses: kyotoExpenses,
    settlements: [],
    rates: { ...DEFAULT_EXCHANGE_RATES },
    createdAt: '2026-11-08T08:00:00Z',
  };

  const goaMembers: Member[] = [
    { id: 'm-rohan', name: 'Rohan Nair', initials: 'RN', color: '#0f766e' },
    { id: 'm-ananya', name: 'Ananya Verma', initials: 'AV', color: '#be123c' },
    { id: 'm-kabir', name: 'Kabir Shah', initials: 'KS', color: '#1d4ed8' },
  ];

  const goaTrip: Trip = {
    id: 'trip-goa',
    name: 'Goa Coastal Retreat',
    subtitle: '3 travelers · Beach villa weekend',
    homeCurrency: 'INR',
    members: goaMembers,
    expenses: [
      {
        id: 'exp-villa',
        title: 'Assagao Villa Deposit',
        amount: 24000,
        currency: 'INR',
        paidById: 'm-rohan',
        participantIds: ['m-rohan', 'm-ananya', 'm-kabir'],
        splitType: 'equal',
        category: 'Stay & Lodging',
        date: '2026-10-18',
        createdAt: '2026-10-18T10:00:00Z',
      },
      {
        id: 'exp-kayak',
        title: 'Sunset Kayaking Booking',
        amount: 45,
        currency: 'USD',
        paidById: 'm-ananya',
        participantIds: ['m-rohan', 'm-ananya', 'm-kabir'],
        splitType: 'equal',
        category: 'Activities',
        date: '2026-10-19',
        createdAt: '2026-10-19T17:15:00Z',
      },
    ],
    settlements: [
      {
        id: 'set-goa-1',
        fromId: 'm-kabir',
        toId: 'm-rohan',
        amount: 4500,
        currency: 'INR',
        settledAt: '2026-10-20T12:00:00Z',
      },
    ],
    rates: { ...DEFAULT_EXCHANGE_RATES },
    createdAt: '2026-10-18T08:00:00Z',
  };

  return {
    trips: [kyotoTrip, goaTrip],
    activeTripId: kyotoTrip.id,
  };
}

function isValidCurrency(val: unknown): val is CurrencyCode {
  return typeof val === 'string' && SUPPORTED_CURRENCIES.includes(val as CurrencyCode);
}

/**
 * Safely normalizes any persisted or legacy Trip object so existing localStorage
 * data remains intact and gains default multi-currency / settlement fields.
 */
export function normalizeTrip(raw: Partial<Trip>, fallbackIdx = 0): Trip {
  const members: Member[] = Array.isArray(raw.members)
    ? raw.members.map((m, idx) => ({
        id: String(m.id ?? `m-${idx}`),
        name: String(m.name ?? `Member ${idx + 1}`),
        initials: m.initials || makeInitials(String(m.name ?? `M${idx + 1}`)),
        color: m.color || pickMemberColor(idx),
      }))
    : [];

  const homeCurrency: CurrencyCode = isValidCurrency(raw.homeCurrency)
    ? raw.homeCurrency
    : 'USD';

  const expenses: Expense[] = Array.isArray(raw.expenses)
    ? raw.expenses.map((e, idx) => ({
        id: String(e.id ?? `exp-${idx}`),
        title: String(e.title ?? 'Untitled Expense'),
        amount: typeof e.amount === 'number' && Number.isFinite(e.amount) ? e.amount : 0,
        currency: isValidCurrency(e.currency) ? e.currency : homeCurrency,
        paidById: String(e.paidById ?? members[0]?.id ?? ''),
        participantIds: Array.isArray(e.participantIds)
          ? e.participantIds.map(String)
          : members.map((m) => m.id),
        splitType:
          e.splitType === 'exact' || e.splitType === 'shares' ? e.splitType : 'equal',
        splitValues: e.splitValues,
        category: e.category || 'Other',
        date: String(e.date ?? new Date().toISOString().slice(0, 10)),
        notes: e.notes,
        receiptBreakdown:
          e.receiptBreakdown && typeof e.receiptBreakdown === 'object'
            ? e.receiptBreakdown
            : undefined,
        createdAt: String(e.createdAt ?? new Date().toISOString()),
      }))
    : [];

  const settlements: SettlementRecord[] = Array.isArray(raw.settlements)
    ? raw.settlements.map((s, idx) => ({
        id: String(s.id ?? `set-${idx}`),
        fromId: String(s.fromId),
        toId: String(s.toId),
        amount: typeof s.amount === 'number' && Number.isFinite(s.amount) ? s.amount : 0,
        currency: isValidCurrency(s.currency) ? s.currency : homeCurrency,
        settledAt: String(s.settledAt ?? new Date().toISOString()),
      }))
    : [];

  const notifications: PaymentNotification[] = Array.isArray(raw.notifications)
    ? raw.notifications.map((n, idx) => ({
        id: String(n.id ?? `notif-${idx}`),
        settlementId: String(n.settlementId ?? ''),
        fromId: String(n.fromId ?? ''),
        toId: String(n.toId ?? ''),
        fromName: String(n.fromName ?? 'Member'),
        toName: String(n.toName ?? 'Member'),
        amount: typeof n.amount === 'number' && Number.isFinite(n.amount) ? n.amount : 0,
        currency: isValidCurrency(n.currency) ? n.currency : homeCurrency,
        createdAt: String(n.createdAt ?? new Date().toISOString()),
        read: Boolean(n.read),
      }))
    : [];

  return {
    id: String(raw.id ?? `trip-${fallbackIdx}`),
    name: String(raw.name ?? `Trip ${fallbackIdx + 1}`),
    subtitle: raw.subtitle,
    homeCurrency,
    members,
    expenses,
    settlements,
    notifications,
    rates: {
      ...DEFAULT_EXCHANGE_RATES,
      ...(raw.rates ?? {}),
    },
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
  };
}

export function migratePersistedState(parsed: unknown): AppState | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  if (Array.isArray(obj.trips) && obj.trips.length > 0) {
    const trips = obj.trips.map((t, idx) => normalizeTrip(t as Partial<Trip>, idx));
    const activeId =
      typeof obj.activeTripId === 'string' &&
      trips.some((t) => t.id === obj.activeTripId)
        ? obj.activeTripId
        : trips[0].id;
    return { trips, activeTripId: activeId };
  }

  // Legacy single-trip shape fallback (e.g. { members, expenses, name })
  if (Array.isArray(obj.expenses) || Array.isArray(obj.members)) {
    const migratedTrip = normalizeTrip(obj as Partial<Trip>, 0);
    return { trips: [migratedTrip], activeTripId: migratedTrip.id };
  }

  return null;
}

export function loadAppState(): AppState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createInitialState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const migrated = migratePersistedState(JSON.parse(raw));
      if (migrated) return migrated;
    }

    for (const legacyKey of LEGACY_KEYS) {
      const legacyRaw = window.localStorage.getItem(legacyKey);
      if (legacyRaw) {
        const migrated = migratePersistedState(JSON.parse(legacyRaw));
        if (migrated) {
          saveAppState(migrated);
          return migrated;
        }
      }
    }
  } catch {
    // Corrupted JSON falls back cleanly to deterministic seed state
  }

  const initial = createInitialState();
  saveAppState(initial);
  return initial;
}

export function saveAppState(state: AppState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}
