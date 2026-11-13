import { useEffect, useMemo, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type {
  CurrencyCode,
  ExchangeRates,
  Expense,
  ExpenseCategory,
  Member,
  SplitType,
} from '../types';
import {
  CURRENCY_META,
  DEFAULT_EXCHANGE_RATES,
  SUPPORTED_CURRENCIES,
  convertAmount,
  formatCurrency,
  formatExchangeRate,
  getSmallestUnit,
} from '../utils/currency';
import { calculateExpenseSharesHome } from '../utils/ledger';

interface ExpenseModalProps {
  isOpen: boolean;
  editingExpense: Expense | null;
  members: Member[];
  homeCurrency: CurrencyCode;
  rates?: ExchangeRates;
  onClose: () => void;
  onOpenReceiptCapture?: () => void;
  onSave: (expenseData: Omit<Expense, 'id' | 'createdAt'>, existingId?: string) => void;
}

const CATEGORIES: ExpenseCategory[] = [
  'Food & Dining',
  'Stay & Lodging',
  'Transport',
  'Activities',
  'Shopping',
  'Other',
];

export function ExpenseModal({
  isOpen,
  editingExpense,
  members,
  homeCurrency,
  rates = DEFAULT_EXCHANGE_RATES,
  onClose,
  onOpenReceiptCapture,
  onSave,
}: ExpenseModalProps) {
  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(homeCurrency);
  const [paidById, setPaidById] = useState(members[0]?.id ?? '');
  const [category, setCategory] = useState<ExpenseCategory>('Food & Dining');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [splitValuesStr, setSplitValuesStr] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (editingExpense) {
      setTitle(editingExpense.title);
      setAmountStr(String(editingExpense.amount));
      setCurrency(editingExpense.currency);
      setPaidById(editingExpense.paidById || members[0]?.id || '');
      setCategory(editingExpense.category);
      setDate(editingExpense.date);
      setSplitType(editingExpense.splitType);
      setParticipantIds(editingExpense.participantIds);
      const initialSplits: Record<string, string> = {};
      members.forEach((m) => {
        const val = editingExpense.splitValues?.[m.id];
        initialSplits[m.id] =
          val !== undefined
            ? String(val)
            : editingExpense.splitType === 'shares'
              ? '1'
              : '';
      });
      setSplitValuesStr(initialSplits);
      setNotes(editingExpense.notes ?? '');
    } else {
      setTitle('');
      setAmountStr('');
      setCurrency(homeCurrency);
      setPaidById(members[0]?.id ?? '');
      setCategory('Food & Dining');
      setDate(new Date().toISOString().slice(0, 10));
      setSplitType('equal');
      setParticipantIds(members.map((m) => m.id));
      const defaults: Record<string, string> = {};
      members.forEach((m) => {
        defaults[m.id] = '1';
      });
      setSplitValuesStr(defaults);
      setNotes('');
    }
    setError(null);
  }, [isOpen, editingExpense, members, homeCurrency]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const parsedAmount = Number(amountStr);
  const isValidAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const convertedPreview = isValidAmount
    ? convertAmount(parsedAmount, currency, homeCurrency, rates)
    : 0;

  const parsedSplitValues = useMemo(() => {
    const out: Record<string, number> = {};
    for (const id of participantIds) {
      const n = Number(splitValuesStr[id]);
      out[id] = Number.isFinite(n) && n >= 0 ? n : 0;
    }
    return out;
  }, [participantIds, splitValuesStr]);

  const previewSharesHome = useMemo(() => {
    if (!isValidAmount || participantIds.length === 0) return {};
    const draft: Expense = {
      id: 'preview',
      title: title || 'Bill',
      amount: parsedAmount,
      currency,
      paidById,
      participantIds,
      splitType,
      splitValues: splitType === 'equal' ? undefined : parsedSplitValues,
      category,
      date,
      createdAt: '',
    };
    return calculateExpenseSharesHome(draft, homeCurrency, rates);
  }, [
    isValidAmount,
    parsedAmount,
    currency,
    paidById,
    participantIds,
    splitType,
    parsedSplitValues,
    category,
    date,
    homeCurrency,
    rates,
    title,
  ]);

  if (!isOpen) return null;

  const toggleParticipant = (id: string) => {
    setParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Please enter a bill title or description.');
      return;
    }
    if (!isValidAmount) {
      setError('Please enter a valid positive bill amount.');
      return;
    }
    if (!paidById) {
      setError('Please select who paid this bill.');
      return;
    }
    if (participantIds.length === 0) {
      setError('Select at least one traveler to split this bill.');
      return;
    }

    if (splitType === 'exact') {
      const exactSum = participantIds.reduce(
        (sum, id) => sum + (parsedSplitValues[id] ?? 0),
        0
      );
      const tolerance = getSmallestUnit(currency) * 1.5;
      if (Math.abs(exactSum - parsedAmount) > tolerance) {
        setError(
          `Exact split amounts (${formatCurrency(exactSum, currency)}) must equal the bill total (${formatCurrency(parsedAmount, currency)}).`
        );
        return;
      }
    }

    if (splitType === 'shares') {
      const shareSum = participantIds.reduce(
        (sum, id) => sum + (parsedSplitValues[id] ?? 0),
        0
      );
      if (shareSum <= 0) {
        setError('Total shares must be greater than zero.');
        return;
      }
    }

    onSave(
      {
        title: trimmedTitle,
        amount: parsedAmount,
        currency,
        paidById,
        participantIds,
        splitType,
        splitValues: splitType === 'equal' ? undefined : parsedSplitValues,
        category,
        date,
        notes: notes.trim() || undefined,
      },
      editingExpense?.id
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-modal-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <h2
            id="expense-modal-title"
            className="font-display text-base font-bold text-slate-900"
          >
            {editingExpense ? 'Edit Bill' : 'Add Multi-Currency Bill'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close bill dialog"
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5" noValidate>
          {!editingExpense && onOpenReceiptCapture && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50/70 px-3.5 py-2.5">
              <div className="text-xs text-teal-950">
                <span className="font-semibold">Got a messy receipt or chat note?</span>{' '}
                <span className="text-teal-800">Let AI extract items, tax &amp; tip.</span>
              </div>
              <button
                type="button"
                onClick={onOpenReceiptCapture}
                className="inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-800"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Smart Receipt</span>
              </button>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="bill-title"
              className="block text-xs font-semibold text-slate-700"
            >
              Bill Description
            </label>
            <input
              id="bill-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Shinkansen Tickets, Dinner at Pontocho"
              className="mt-1.5 min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="bill-amount"
                className="block text-xs font-semibold text-slate-700"
              >
                Amount
              </label>
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono-num text-sm font-medium text-slate-500">
                  {CURRENCY_META[currency].symbol}
                </span>
                <input
                  id="bill-amount"
                  type="number"
                  step={CURRENCY_META[currency].decimals === 0 ? '1' : '0.01'}
                  min="0"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  placeholder={currency === 'JPY' ? '12000' : '45.00'}
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 font-mono-num text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="bill-currency"
                className="block text-xs font-semibold text-slate-700"
              >
                Bill Currency
              </label>
              <select
                id="bill-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="mt-1.5 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
              >
                {SUPPORTED_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code} ({CURRENCY_META[code].symbol}) — {CURRENCY_META[code].name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Live Home Currency Conversion Banner */}
          <div
            data-testid="conversion-preview"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs"
          >
            <span className="text-slate-600">
              {currency === homeCurrency
                ? `Matches trip home currency (${homeCurrency})`
                : `Auto-converted (${formatExchangeRate(currency, homeCurrency, rates)})`}
            </span>
            <span className="font-mono-num font-semibold text-teal-800">
              {isValidAmount
                ? `≈ ${formatCurrency(convertedPreview, homeCurrency, { showCode: true })}`
                : `0.00 ${homeCurrency}`}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label
                htmlFor="bill-payer"
                className="block text-xs font-semibold text-slate-700"
              >
                Paid By
              </label>
              <select
                id="bill-payer"
                value={paidById}
                onChange={(e) => setPaidById(e.target.value)}
                className="mt-1.5 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="bill-category"
                className="block text-xs font-semibold text-slate-700"
              >
                Category
              </label>
              <select
                id="bill-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="mt-1.5 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="bill-date"
                className="block text-xs font-semibold text-slate-700"
              >
                Date
              </label>
              <input
                id="bill-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1.5 min-h-[42px] w-full rounded-lg border border-slate-300 px-2.5 py-2 font-mono-num text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
              />
            </div>
          </div>

          {/* Split Method */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700">
                Split Between
              </span>
              <div
                role="group"
                aria-label="Split method"
                className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5"
              >
                {(
                  [
                    { id: 'equal', label: 'Equal' },
                    { id: 'exact', label: 'Exact' },
                    { id: 'shares', label: 'Shares' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    aria-pressed={splitType === mode.id}
                    onClick={() => setSplitType(mode.id)}
                    className={`min-h-[30px] rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      splitType === mode.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {members.map((m) => {
                const included = participantIds.includes(m.id);
                const shareHome = previewSharesHome[m.id] ?? 0;

                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <label className="flex min-h-[32px] flex-1 cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={() => toggleParticipant(m.id)}
                        className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                      />
                      <span className="text-sm font-medium text-slate-800">
                        {m.name}
                      </span>
                    </label>

                    <div className="flex items-center gap-2">
                      {included && splitType !== 'equal' && (
                        <input
                          type="number"
                          min="0"
                          step={splitType === 'shares' ? '1' : '0.01'}
                          aria-label={`${splitType === 'exact' ? 'Exact amount' : 'Share weight'} for ${m.name}`}
                          value={splitValuesStr[m.id] ?? ''}
                          onChange={(e) =>
                            setSplitValuesStr((prev) => ({
                              ...prev,
                              [m.id]: e.target.value,
                            }))
                          }
                          placeholder={splitType === 'shares' ? '1' : '0.00'}
                          className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right font-mono-num text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                        />
                      )}
                      <span className="min-w-[72px] text-right font-mono-num text-xs text-slate-500">
                        {included
                          ? formatCurrency(shareHome, homeCurrency)
                          : '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor="bill-notes"
              className="block text-xs font-semibold text-slate-700"
            >
              Notes (optional)
            </label>
            <input
              id="bill-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Receipt ref, card used, etc."
              className="mt-1.5 min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[42px] rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            >
              {editingExpense ? 'Save Changes' : 'Save Bill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
