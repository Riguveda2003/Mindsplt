export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'JPY';

export type SplitType = 'equal' | 'exact' | 'shares';

export type ExpenseCategory =
  | 'Food & Dining'
  | 'Stay & Lodging'
  | 'Transport'
  | 'Activities'
  | 'Shopping'
  | 'Other';

/**
 * Units of currency per 1 USD.
 * Example: INR: 84.5 means 1 USD = 84.5 INR.
 */
export type ExchangeRates = Record<CurrencyCode, number>;

export interface Member {
  id: string;
  name: string;
  initials: string;
  color: string;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  currency: CurrencyCode;
  paidById: string;
  participantIds: string[];
  splitType: SplitType;
  /** Used when splitType === 'exact' (in bill currency) or 'shares' (weight). */
  splitValues?: Record<string, number>;
  category: ExpenseCategory;
  date: string;
  notes?: string;
  createdAt: string;
}

export interface SettlementRecord {
  id: string;
  fromId: string;
  toId: string;
  amount: number;
  currency: CurrencyCode;
  settledAt: string;
}

export interface PaymentNotification {
  id: string;
  settlementId: string;
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  amount: number;
  currency: CurrencyCode;
  createdAt: string;
  read: boolean;
}

export interface Trip {
  id: string;
  name: string;
  subtitle?: string;
  homeCurrency: CurrencyCode;
  members: Member[];
  expenses: Expense[];
  settlements: SettlementRecord[];
  notifications?: PaymentNotification[];
  rates?: ExchangeRates;
  createdAt: string;
}

export interface AppState {
  trips: Trip[];
  activeTripId: string;
}

export interface MemberSummary {
  memberId: string;
  totalPaidHome: number;
  totalShareHome: number;
  rawNetHome: number;
  settledAdjustmentHome: number;
  netBalanceHome: number;
}

export interface TransferSuggestion {
  id: string;
  fromId: string;
  toId: string;
  amountHome: number;
}

export interface PairwiseBillItem {
  expenseId: string;
  title: string;
  date: string;
  originalAmount: number;
  originalCurrency: CurrencyCode;
  shareHome: number;
  /** 'from_owes_to' means fromId participated in a bill paid by toId; 'to_owes_from' means the reverse. */
  direction: 'from_owes_to' | 'to_owes_from';
}

export interface DirectTransferSuggestion extends TransferSuggestion {
  billItems: PairwiseBillItem[];
  settledOffsetHome: number;
}


