import { useMemo, useState } from 'react';
import {
  BedDouble,
  Car,
  Compass,
  Pencil,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  Trash2,
  Utensils,
} from 'lucide-react';
import type {
  CurrencyCode,
  ExchangeRates,
  Expense,
  ExpenseCategory,
  Member,
} from '../types';
import {
  DEFAULT_EXCHANGE_RATES,
  SUPPORTED_CURRENCIES,
  formatCurrency,
} from '../utils/currency';
import { getExpenseConvertedTotal } from '../utils/ledger';

interface ExpensesPanelProps {
  expenses: Expense[];
  members: Member[];
  homeCurrency: CurrencyCode;
  rates?: ExchangeRates;
  onAddExpense: () => void;
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (expenseId: string) => void;
}

const CATEGORY_OPTIONS: ('All' | ExpenseCategory)[] = [
  'All',
  'Food & Dining',
  'Stay & Lodging',
  'Transport',
  'Activities',
  'Shopping',
  'Other',
];

function CategoryIcon({ category }: { category: ExpenseCategory }) {
  const cls = 'h-4 w-4 text-slate-600';
  switch (category) {
    case 'Food & Dining':
      return <Utensils className={cls} aria-hidden="true" />;
    case 'Stay & Lodging':
      return <BedDouble className={cls} aria-hidden="true" />;
    case 'Transport':
      return <Car className={cls} aria-hidden="true" />;
    case 'Activities':
      return <Compass className={cls} aria-hidden="true" />;
    case 'Shopping':
      return <ShoppingBag className={cls} aria-hidden="true" />;
    default:
      return <Receipt className={cls} aria-hidden="true" />;
  }
}

export function ExpensesPanel({
  expenses,
  members,
  homeCurrency,
  rates = DEFAULT_EXCHANGE_RATES,
  onAddExpense,
  onEditExpense,
  onDeleteExpense,
}: ExpensesPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState<'ALL' | CurrencyCode>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'All' | ExpenseCategory>('All');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const memberMap = useMemo(() => {
    const map = new Map<string, Member>();
    members.forEach((m) => map.set(m.id, m));
    return map;
  }, [members]);

  const filteredExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...expenses]
      .filter((exp) => {
        if (currencyFilter !== 'ALL' && exp.currency !== currencyFilter) {
          return false;
        }
        if (categoryFilter !== 'All' && exp.category !== categoryFilter) {
          return false;
        }
        if (!q) return true;
        const payer = memberMap.get(exp.paidById)?.name.toLowerCase() ?? '';
        return (
          exp.title.toLowerCase().includes(q) ||
          exp.category.toLowerCase().includes(q) ||
          payer.includes(q) ||
          (exp.notes?.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [expenses, currencyFilter, categoryFilter, searchQuery, memberMap]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Trip Expenses
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Bills logged in any currency automatically convert to {homeCurrency}
            </p>
          </div>
          <button
            type="button"
            onClick={onAddExpense}
            className="hidden sm:inline-flex min-h-[38px] items-center justify-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Log Bill</span>
          </button>
        </div>

        {/* Search & Filters */}
        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <label htmlFor="expense-search" className="sr-only">
              Search expenses
            </label>
            <input
              id="expense-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search bills, payers, or notes..."
              className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="category-filter" className="sr-only">
              Filter by category
            </label>
            <select
              id="category-filter"
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as 'All' | ExpenseCategory)
              }
              className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
            >
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'All' ? 'All Categories' : cat}
                </option>
              ))}
            </select>

            <div
              role="group"
              aria-label="Filter expenses by currency"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5"
            >
              {(['ALL', ...SUPPORTED_CURRENCIES] as const).map((cur) => {
                const active = currencyFilter === cur;
                return (
                  <button
                    key={cur}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCurrencyFilter(cur)}
                    className={`min-h-[32px] whitespace-nowrap shrink-0 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {cur === 'ALL' ? 'All' : cur}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Expense List */}
      {filteredExpenses.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-900">
            {expenses.length === 0
              ? 'No bills logged for this trip yet'
              : 'No bills match your filters'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {expenses.length === 0
              ? 'Add your first bill in INR, USD, EUR, or JPY to start splitting.'
              : 'Try clearing the search query or currency filter.'}
          </p>
          {expenses.length === 0 ? (
            <button
              type="button"
              onClick={onAddExpense}
              className="mt-4 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Log First Bill</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setCurrencyFilter('ALL');
                setCategoryFilter('All');
              }}
              className="mt-4 inline-flex min-h-[40px] items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <ul data-testid="expenses-list" className="divide-y divide-slate-100">
          {filteredExpenses.map((exp) => {
            const payer = memberMap.get(exp.paidById);
            const convertedHome = getExpenseConvertedTotal(exp, homeCurrency, rates);
            const isForeign = exp.currency !== homeCurrency;
            const isConfirmingDelete = confirmDeleteId === exp.id;

            return (
              <li
                key={exp.id}
                className="group px-5 py-4 transition-colors hover:bg-slate-50/70"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                      <CategoryIcon category={exp.category} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {exp.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                        <span>{exp.date}</span>
                        <span aria-hidden="true">·</span>
                        <span>Paid by {payer?.name ?? 'Unknown'}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {exp.splitType === 'equal'
                            ? `Split ${exp.participantIds.length} ways`
                            : exp.splitType === 'exact'
                              ? `Exact (${exp.participantIds.length})`
                              : `By shares (${exp.participantIds.length})`}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{exp.category}</span>
                      </div>
                      {exp.notes && (
                        <p className="mt-1 text-xs text-slate-500">{exp.notes}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <div className="text-right">
                      <p className="font-mono-num text-sm font-semibold text-slate-900">
                        {formatCurrency(convertedHome, homeCurrency)}
                      </p>
                      <p className="font-mono-num text-xs text-slate-500">
                        {isForeign
                          ? `${formatCurrency(exp.amount, exp.currency, { showCode: true })}`
                          : exp.currency}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteExpense(exp.id);
                              setConfirmDeleteId(null);
                            }}
                            aria-label={`Confirm delete '${exp.title}'`}
                            className="min-h-[32px] rounded-md bg-rose-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-800"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[32px] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => onEditExpense(exp)}
                            aria-label={`Edit '${exp.title}'`}
                            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(exp.id)}
                            aria-label={`Delete '${exp.title}'`}
                            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
