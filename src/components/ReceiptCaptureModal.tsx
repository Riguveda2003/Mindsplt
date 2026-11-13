import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Loader2,
  Plus,
  ReceiptText,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type {
  CurrencyCode,
  ExchangeRates,
  Expense,
  ExpenseCategory,
  Member,
  ParsedReceiptResult,
  ReceiptLineItem,
  ReceiptTaxTipMode,
} from '../types';
import {
  CURRENCY_META,
  DEFAULT_EXCHANGE_RATES,
  SUPPORTED_CURRENCIES,
  convertAmount,
  formatCurrency,
  formatExchangeRate,
} from '../utils/currency';
import {
  SAMPLE_RECEIPTS,
  buildExpenseFromReceipt,
  calculateReceiptSplit,
  matchPaidByMemberId,
  matchSuggestedMemberIds,
} from '../utils/receipt';

interface ReceiptCaptureModalProps {
  isOpen: boolean;
  editingExpense: Expense | null;
  members: Member[];
  homeCurrency: CurrencyCode;
  rates?: ExchangeRates;
  onClose: () => void;
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

function makeItemId(idx: number): string {
  return `ri-${Date.now().toString(36)}-${idx}-${Math.random().toString(36).slice(2, 5)}`;
}

export function ReceiptCaptureModal({
  isOpen,
  editingExpense,
  members,
  homeCurrency,
  rates = DEFAULT_EXCHANGE_RATES,
  onClose,
  onSave,
}: ReceiptCaptureModalProps) {
  const [step, setStep] = useState<'paste' | 'assign'>('paste');
  const [rawText, setRawText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(homeCurrency);
  const [paidById, setPaidById] = useState(members[0]?.id ?? '');
  const [category, setCategory] = useState<ExpenseCategory>('Food & Dining');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  const [items, setItems] = useState<ReceiptLineItem[]>([]);
  const [taxStr, setTaxStr] = useState('0');
  const [tipStr, setTipStr] = useState('0');
  const [discountStr, setDiscountStr] = useState('0');
  const [taxTipMode, setTaxTipMode] = useState<ReceiptTaxTipMode>('proportional');
  const [printedReceiptTotal, setPrintedReceiptTotal] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setParseError(null);
    setFormError(null);
    setIsParsing(false);

    if (editingExpense?.receiptBreakdown) {
      const rb = editingExpense.receiptBreakdown;
      setStep('assign');
      setRawText(rb.rawSourceText ?? '');
      setTitle(editingExpense.title);
      setCurrency(editingExpense.currency);
      setPaidById(editingExpense.paidById || members[0]?.id || '');
      setCategory(editingExpense.category);
      setDate(editingExpense.date);
      setNotes(editingExpense.notes ?? '');
      setItems(rb.items.map((it) => ({ ...it, sharedByIds: [...it.sharedByIds] })));
      setTaxStr(String(rb.tax));
      setTipStr(String(rb.tip));
      setDiscountStr(String(rb.discount));
      setTaxTipMode(rb.taxTipMode);
      setPrintedReceiptTotal(null);
    } else {
      setStep('paste');
      setRawText('');
      setTitle('');
      setCurrency(homeCurrency);
      setPaidById(members[0]?.id ?? '');
      setCategory('Food & Dining');
      setDate(new Date().toISOString().slice(0, 10));
      setNotes('');
      setItems([]);
      setTaxStr('0');
      setTipStr('0');
      setDiscountStr('0');
      setTaxTipMode('proportional');
      setPrintedReceiptTotal(null);
    }
  }, [isOpen, editingExpense, members, homeCurrency]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isParsing) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, isParsing, onClose]);

  const parsedTax = Math.max(0, Number(taxStr) || 0);
  const parsedTip = Math.max(0, Number(tipStr) || 0);
  const parsedDiscount = Math.max(0, Number(discountStr) || 0);

  const split = useMemo(
    () =>
      calculateReceiptSplit({
        items,
        tax: parsedTax,
        tip: parsedTip,
        discount: parsedDiscount,
        taxTipMode,
        currency,
        members,
      }),
    [items, parsedTax, parsedTip, parsedDiscount, taxTipMode, currency, members]
  );

  const convertedHomeTotal = convertAmount(
    split.grandTotal,
    currency,
    homeCurrency,
    rates
  );

  if (!isOpen) return null;

  const handleExtract = async (textOverride?: string) => {
    const textToParse = (textOverride ?? rawText).trim();
    if (!textToParse) {
      setParseError('Paste a restaurant receipt or group chat note first.');
      return;
    }

    setIsParsing(true);
    setParseError(null);
    setFormError(null);

    try {
      const response = await fetch('/api/receipt/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: textToParse,
          defaultCurrency: homeCurrency,
          memberNames: members.map((m) => m.name),
        }),
      });

      const data = (await response.json()) as ParsedReceiptResult & { error?: string };
      if (!response.ok) {
        setParseError(data.error || 'Could not extract line items from receipt.');
        return;
      }

      const extractedItems: ReceiptLineItem[] = (data.items ?? []).map((it, idx) => ({
        id: makeItemId(idx),
        name: it.name,
        quantity: it.quantity > 0 ? it.quantity : 1,
        price: Math.max(0, Number(it.totalPrice) || 0),
        sharedByIds: matchSuggestedMemberIds(it.suggestedMembers ?? [], members),
      }));

      setTitle(data.merchantTitle || 'Shared Receipt');
      setCurrency(data.currency || homeCurrency);
      setCategory(data.category || 'Food & Dining');
      if (data.date) setDate(data.date);
      setPaidById(
        matchPaidByMemberId(data.paidByName || '', members, members[0]?.id ?? '')
      );
      setNotes(data.notes || '');
      setItems(
        extractedItems.length > 0
          ? extractedItems
          : [
              {
                id: makeItemId(0),
                name: 'Shared Meal',
                quantity: 1,
                price: Math.max(0, data.receiptTotal || 0),
                sharedByIds: members.map((m) => m.id),
              },
            ]
      );
      setTaxStr(String(data.tax ?? 0));
      setTipStr(String(data.tip ?? 0));
      setDiscountStr(String(data.discount ?? 0));
      setPrintedReceiptTotal(
        typeof data.receiptTotal === 'number' && data.receiptTotal > 0
          ? data.receiptTotal
          : null
      );
      setStep('assign');
    } catch {
      setParseError(
        'Network error reaching receipt parser. Please check your connection and retry.'
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleStartManual = () => {
    setParseError(null);
    setFormError(null);
    setTitle(title || 'Group Dinner Receipt');
    if (items.length === 0) {
      setItems([
        {
          id: makeItemId(0),
          name: 'Shared Appetizer',
          quantity: 1,
          price: 0,
          sharedByIds: members.map((m) => m.id),
        },
      ]);
    }
    setStep('assign');
  };

  const toggleMemberOnItem = (itemId: string, memberId: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const exists = item.sharedByIds.includes(memberId);
        return {
          ...item,
          sharedByIds: exists
            ? item.sharedByIds.filter((id) => id !== memberId)
            : [...item.sharedByIds, memberId],
        };
      })
    );
  };

  const toggleAllOnItem = (itemId: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const allSelected = members.every((m) => item.sharedByIds.includes(m.id));
        return {
          ...item,
          sharedByIds: allSelected ? [] : members.map((m) => m.id),
        };
      })
    );
  };

  const assignUnassignedToAll = () => {
    const allIds = members.map((m) => m.id);
    setItems((prev) =>
      prev.map((item) =>
        item.sharedByIds.length === 0 ? { ...item, sharedByIds: allIds } : item
      )
    );
    setFormError(null);
  };

  const splitAllItemsEqually = () => {
    const allIds = members.map((m) => m.id);
    setItems((prev) => prev.map((item) => ({ ...item, sharedByIds: allIds })));
    setFormError(null);
  };

  const updateItemField = (
    itemId: string,
    patch: Partial<Pick<ReceiptLineItem, 'name' | 'price'>>
  ) => {
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
    );
  };

  const removeItem = (itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const addBlankItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: makeItemId(prev.length),
        name: '',
        quantity: 1,
        price: 0,
        sharedByIds: [],
      },
    ]);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError('Please enter a bill title.');
      return;
    }
    if (items.length === 0) {
      setFormError('Add at least one receipt line item.');
      return;
    }
    const unnamedItem = items.find((it) => !it.name.trim());
    if (unnamedItem) {
      setFormError('Every line item needs a name.');
      return;
    }
    if (split.unassignedItemIds.length > 0) {
      setFormError(
        `${split.unassignedItemIds.length} priced item(s) have no friends tapped yet. Tap who shared each item or assign remaining items to everyone.`
      );
      return;
    }
    if (split.grandTotal <= 0) {
      setFormError('Receipt total must be greater than zero.');
      return;
    }
    if (!paidById) {
      setFormError('Please select who paid this receipt.');
      return;
    }

    const { expenseData } = buildExpenseFromReceipt({
      title: trimmedTitle,
      currency,
      paidById,
      category,
      date,
      notes,
      items,
      tax: parsedTax,
      tip: parsedTip,
      discount: parsedDiscount,
      taxTipMode,
      rawSourceText: rawText,
      members,
    });

    onSave(expenseData, editingExpense?.id);
  };

  const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isParsing) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-modal-title"
        className="max-h-[93vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <ReceiptText className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="receipt-modal-title"
                className="font-display text-base font-bold text-slate-900"
              >
                Smart Receipt Capture
              </h2>
              <p className="text-xs text-slate-500">
                {step === 'paste'
                  ? 'Paste a receipt or chat note to extract items, tax, and tip'
                  : 'Tap which friends shared each item — tax & tip split automatically'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isParsing}
            aria-label="Close smart receipt dialog"
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Step 1: Paste Receipt / Chat Note */}
        {step === 'paste' && (
          <div className="space-y-4 p-5">
            {parseError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{parseError}</span>
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="receipt-raw-input"
                  className="text-xs font-semibold text-slate-700"
                >
                  Paste messy receipt or chat note
                </label>
                <span className="text-[11px] text-slate-500">
                  Group: {members.map((m) => firstName(m.name)).join(', ')}
                </span>
              </div>

              <textarea
                id="receipt-raw-input"
                rows={7}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={
                  'Paste itemized restaurant text, WhatsApp message, or dinner notes...\n\nExample:\n2x Ramen ¥2,400\nGyoza ¥680 (all shared)\nMatcha Highball ¥720 (Maya)\nTax ¥380, Service ¥400'
                }
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50/40 px-3.5 py-3 font-mono-num text-xs leading-relaxed text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-teal-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-700/20"
              />
            </div>

            {/* Quick Sample Receipts */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-600">
                Or load a sample receipt / chat note:
              </p>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_RECEIPTS.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    disabled={isParsing}
                    onClick={() => {
                      setRawText(sample.rawText);
                      setParseError(null);
                    }}
                    className="min-h-[34px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-teal-300 hover:bg-teal-50/60 hover:text-teal-900 disabled:opacity-50"
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={handleStartManual}
                disabled={isParsing}
                className="text-xs font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-900 disabled:opacity-50"
              >
                Skip AI &amp; enter items manually
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isParsing}
                  className="min-h-[42px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleExtract()}
                  disabled={isParsing}
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isParsing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span>Extracting items...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                      <span>Extract Items</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Tap Friends Who Shared Each Line Item */}
        {step === 'assign' && (
          <form onSubmit={handleSave} className="space-y-5 p-5" noValidate>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep('paste')}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Edit Receipt Text</span>
              </button>

              <button
                type="button"
                onClick={splitAllItemsEqually}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-50"
              >
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Split all items equally</span>
              </button>
            </div>

            {formError && (
              <div
                role="alert"
                className="flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{formError}</span>
                </div>
                {split.unassignedItemIds.length > 0 && (
                  <button
                    type="button"
                    onClick={assignUnassignedToAll}
                    className="shrink-0 rounded-md bg-rose-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-800"
                  >
                    Assign unassigned to all
                  </button>
                )}
              </div>
            )}

            {/* Bill Metadata */}
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor="receipt-bill-title"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Bill Description
                </label>
                <input
                  id="receipt-bill-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Pontocho Izakaya Dinner"
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
                />
              </div>

              <div>
                <label
                  htmlFor="receipt-currency"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Receipt Currency
                </label>
                <select
                  id="receipt-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-medium text-slate-900 focus:border-teal-700 focus:outline-none"
                >
                  {SUPPORTED_CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code} ({CURRENCY_META[code].symbol}) — {CURRENCY_META[code].name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="receipt-payer"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Paid By
                </label>
                <select
                  id="receipt-payer"
                  value={paidById}
                  onChange={(e) => setPaidById(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
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
                  htmlFor="receipt-category"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Category
                </label>
                <select
                  id="receipt-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
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
                  htmlFor="receipt-date"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Date
                </label>
                <input
                  id="receipt-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono-num text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>
            </div>

            {/* Line Items + Tap Friends */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Line Items ({items.length}) — Tap friends who shared
                </h3>
                {split.unassignedItemIds.length > 0 && (
                  <button
                    type="button"
                    onClick={assignUnassignedToAll}
                    className="text-xs font-semibold text-amber-800 underline decoration-amber-400 underline-offset-2 hover:text-amber-950"
                  >
                    {split.unassignedItemIds.length} unassigned · Tap to split all
                  </button>
                )}
              </div>

              <div className="mt-2 space-y-2.5">
                {items.map((item, idx) => {
                  const shareCount = item.sharedByIds.length;
                  const allSelected =
                    members.length > 0 &&
                    members.every((m) => item.sharedByIds.includes(m.id));
                  const perFriendAmount =
                    shareCount > 0 ? item.price / shareCount : item.price;

                  return (
                    <div
                      key={item.id}
                      data-testid="receipt-item-row"
                      className={`rounded-xl border p-3 transition-colors ${
                        shareCount === 0 && item.price > 0
                          ? 'border-amber-300 bg-amber-50/40'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                        <input
                          type="text"
                          aria-label={`Line item ${idx + 1} name`}
                          value={item.name}
                          onChange={(e) =>
                            updateItemField(item.id, { name: e.target.value })
                          }
                          placeholder="Item name"
                          className="min-h-[38px] min-w-[140px] flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900 focus:border-teal-700 focus:outline-none"
                        />

                        <div className="relative w-28 shrink-0">
                          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono-num text-xs text-slate-500">
                            {CURRENCY_META[currency].symbol}
                          </span>
                          <input
                            type="number"
                            min="0"
                            step={CURRENCY_META[currency].decimals === 0 ? '1' : '0.01'}
                            aria-label={`Line item ${idx + 1} price`}
                            value={item.price}
                            onChange={(e) =>
                              updateItemField(item.id, {
                                price: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="min-h-[38px] w-full rounded-lg border border-slate-300 bg-white pl-6 pr-2 py-1.5 text-right font-mono-num text-sm font-semibold text-slate-900 focus:border-teal-700 focus:outline-none"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          aria-label={`Remove item '${item.name || `Item ${idx + 1}`}'`}
                          className="inline-flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>

                      {/* Friend Tap Buttons */}
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {members.map((m) => {
                            const selected = item.sharedByIds.includes(m.id);
                            return (
                              <button
                                key={m.id}
                                type="button"
                                aria-pressed={selected}
                                aria-label={`Share ${item.name || `item ${idx + 1}`} with ${m.name}`}
                                onClick={() => toggleMemberOnItem(item.id, m.id)}
                                className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                                  selected
                                    ? 'border-teal-700 bg-teal-50 text-teal-900'
                                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900'
                                }`}
                              >
                                <span
                                  className="inline-block h-2 w-2 rounded-full"
                                  style={{ backgroundColor: m.color }}
                                  aria-hidden="true"
                                />
                                <span>{firstName(m.name)}</span>
                                {selected && (
                                  <Check className="h-3 w-3 text-teal-700" aria-hidden="true" />
                                )}
                              </button>
                            );
                          })}

                          <button
                            type="button"
                            onClick={() => toggleAllOnItem(item.id)}
                            className="min-h-[34px] rounded-lg border border-dashed border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-900"
                          >
                            {allSelected ? 'None' : 'All'}
                          </button>
                        </div>

                        <span className="font-mono-num text-[11px] font-medium text-slate-500">
                          {shareCount > 0
                            ? `${formatCurrency(perFriendAmount, currency)} ea (${shareCount})`
                            : 'Tap who shared'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={addBlankItem}
                className="mt-2.5 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-800"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Add line item</span>
              </button>
            </div>

            {/* Tax, Tip & Discount */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">
                  Tax, Tip &amp; Discounts
                </span>
                <div
                  role="group"
                  aria-label="Tax and tip split method"
                  className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5"
                >
                  <button
                    type="button"
                    aria-pressed={taxTipMode === 'proportional'}
                    onClick={() => setTaxTipMode('proportional')}
                    className={`min-h-[28px] rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      taxTipMode === 'proportional'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Proportional
                  </button>
                  <button
                    type="button"
                    aria-pressed={taxTipMode === 'equal'}
                    onClick={() => setTaxTipMode('equal')}
                    className={`min-h-[28px] rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      taxTipMode === 'equal'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Equal
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label
                    htmlFor="receipt-tax"
                    className="block text-[11px] font-semibold text-slate-600"
                  >
                    Tax ({currency})
                  </label>
                  <input
                    id="receipt-tax"
                    type="number"
                    min="0"
                    step={CURRENCY_META[currency].decimals === 0 ? '1' : '0.01'}
                    value={taxStr}
                    onChange={(e) => setTaxStr(e.target.value)}
                    className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-right font-mono-num text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="receipt-tip"
                    className="block text-[11px] font-semibold text-slate-600"
                  >
                    Tip / Service ({currency})
                  </label>
                  <input
                    id="receipt-tip"
                    type="number"
                    min="0"
                    step={CURRENCY_META[currency].decimals === 0 ? '1' : '0.01'}
                    value={tipStr}
                    onChange={(e) => setTipStr(e.target.value)}
                    className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-right font-mono-num text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="receipt-discount"
                    className="block text-[11px] font-semibold text-slate-600"
                  >
                    Discount ({currency})
                  </label>
                  <input
                    id="receipt-discount"
                    type="number"
                    min="0"
                    step={CURRENCY_META[currency].decimals === 0 ? '1' : '0.01'}
                    value={discountStr}
                    onChange={(e) => setDiscountStr(e.target.value)}
                    className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-right font-mono-num text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              {printedReceiptTotal !== null &&
                Math.abs(printedReceiptTotal - (split.assignedItemsTotal + split.unassignedItemsTotal + split.tax + split.tip - split.discount)) > 0.5 && (
                  <p className="text-[11px] text-amber-800">
                    Receipt printed total: {formatCurrency(printedReceiptTotal, currency)} · Extracted sum: {formatCurrency(split.assignedItemsTotal + split.unassignedItemsTotal + split.tax + split.tip - split.discount, currency)}. Adjust any line above if needed.
                  </p>
                )}
            </div>

            {/* Live Per-Friend Breakdown */}
            <div
              data-testid="receipt-friend-totals"
              className="rounded-xl border border-slate-200 bg-white"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
                <span className="text-xs font-semibold text-slate-800">
                  Per-Friend Split Preview
                </span>
                <div className="flex items-center gap-2 font-mono-num text-xs">
                  <span className="font-bold text-slate-900">
                    Total: {formatCurrency(split.grandTotal, currency, { showCode: true })}
                  </span>
                  {currency !== homeCurrency && (
                    <span className="text-teal-800">
                      (≈ {formatCurrency(convertedHomeTotal, homeCurrency)} ·{' '}
                      {formatExchangeRate(currency, homeCurrency, rates)})
                    </span>
                  )}
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {members.map((m) => {
                  const row = split.perMember[m.id];
                  const extraNet =
                    (row?.taxShare ?? 0) + (row?.tipShare ?? 0) - (row?.discountShare ?? 0);
                  const homeShare = convertAmount(
                    row?.total ?? 0,
                    currency,
                    homeCurrency,
                    rates
                  );

                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: m.color }}
                          aria-hidden="true"
                        />
                        <span className="font-semibold text-slate-800">{m.name}</span>
                        <span className="text-[11px] text-slate-500">
                          {row.itemCount === 0
                            ? '0 items'
                            : `${row.itemCount} item${row.itemCount === 1 ? '' : 's'}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 font-mono-num">
                        {row.total > 0 && (
                          <span className="hidden text-[11px] text-slate-500 sm:inline">
                            {formatCurrency(row.itemsSubtotal, currency)} +{' '}
                            {formatCurrency(extraNet, currency)} tax/tip
                          </span>
                        )}
                        <span
                          className={`min-w-[72px] text-right font-semibold ${
                            row.total > 0 ? 'text-slate-900' : 'text-slate-400'
                          }`}
                        >
                          {formatCurrency(row.total, currency)}
                        </span>
                        {currency !== homeCurrency && (
                          <span className="min-w-[64px] text-right text-[11px] text-slate-500">
                            {row.total > 0
                              ? formatCurrency(homeShare, homeCurrency)
                              : '—'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
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
                {editingExpense
                  ? `Update Receipt Bill (${formatCurrency(split.grandTotal, currency)})`
                  : `Save Split Bill (${formatCurrency(split.grandTotal, currency)})`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
