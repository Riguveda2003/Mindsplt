import { Globe, Plus } from 'lucide-react';
import type { CurrencyCode, Trip } from '../types';
import {
  CURRENCY_META,
  DEFAULT_EXCHANGE_RATES,
  SUPPORTED_CURRENCIES,
  formatCurrency,
  formatExchangeRate,
} from '../utils/currency';

interface TripSummaryStripProps {
  trips: Trip[];
  activeTrip: Trip;
  totalSpendHome: number;
  unsettledTotalHome: number;
  unsettledCount: number;
  settledCount: number;
  onSelectTrip: (tripId: string) => void;
  onChangeHomeCurrency: (currency: CurrencyCode) => void;
  onOpenNewTrip: () => void;
  onOpenEditMembers: () => void;
}

export function TripSummaryStrip({
  trips,
  activeTrip,
  totalSpendHome,
  unsettledTotalHome,
  unsettledCount,
  settledCount,
  onSelectTrip,
  onChangeHomeCurrency,
  onOpenNewTrip,
  onOpenEditMembers,
}: TripSummaryStripProps) {
  const rates = activeTrip.rates ?? DEFAULT_EXCHANGE_RATES;
  const home = activeTrip.homeCurrency;
  const otherCurrencies = SUPPORTED_CURRENCIES.filter((c) => c !== home);

  return (
    <section
      aria-label="Trip summary"
      className="border-b border-slate-200 bg-white"
    >
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        {/* Trip controls row */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="trip-select" className="sr-only">
                Active trip
              </label>
              <select
                id="trip-select"
                value={activeTrip.id}
                onChange={(e) => onSelectTrip(e.target.value)}
                className="min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 font-display text-lg font-bold text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
              >
                {trips.map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {trip.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onOpenNewTrip}
                aria-label="Create new trip"
                className="inline-flex min-h-[42px] items-center gap-1 whitespace-nowrap shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 md:hidden"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Trip</span>
              </button>
            </div>

            <div className="flex flex-col gap-1 text-xs text-slate-500 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2">
              <div className="flex items-center gap-2">
                <span data-testid="trip-travelers-count">
                  {activeTrip.members.length} travelers
                </span>
                <button
                  type="button"
                  onClick={onOpenEditMembers}
                  aria-label="Edit number of members"
                  className="font-semibold text-teal-700 underline-offset-2 hover:text-teal-900 hover:underline focus-visible:outline-2 focus-visible:outline-teal-700"
                >
                  Edit
                </button>
                <span aria-hidden="true">·</span>
                <span>{activeTrip.expenses.length} bills</span>
              </div>
              <span aria-hidden="true" className="hidden sm:inline">
                ·
              </span>
              <span className="font-mono-num text-[11px] text-slate-500 sm:text-xs">
                {otherCurrencies
                  .map((c) => formatExchangeRate(home, c, rates))
                  .join(' · ')}
              </span>
            </div>
          </div>

          {/* Trip Home Currency Switcher */}
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <Globe className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <span>Trip Home Currency</span>
            </span>
            <div
              role="group"
              aria-label="Select trip home currency"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1"
            >
              {SUPPORTED_CURRENCIES.map((code) => {
                const isSelected = home === code;
                const meta = CURRENCY_META[code];
                return (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onChangeHomeCurrency(code)}
                    className={`min-h-[34px] whitespace-nowrap shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-teal-700 ${
                      isSelected
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {meta.symbol} {code}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 4-Column KPI Strip */}
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5">
            <p className="text-xs font-medium text-slate-500">Total Trip Spend</p>
            <p
              data-testid="kpi-total-spend"
              className="mt-1 font-mono-num text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl"
            >
              {formatCurrency(totalSpendHome, home)}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Converted to {home}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5">
            <p className="text-xs font-medium text-slate-500">Unsettled Balance</p>
            <p
              data-testid="kpi-unsettled-total"
              className={`mt-1 font-mono-num text-xl font-semibold tracking-tight sm:text-2xl ${
                unsettledTotalHome > 0 ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {formatCurrency(unsettledTotalHome, home)}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {unsettledCount === 0
                ? 'All balances settled'
                : `${unsettledCount} transfer${unsettledCount === 1 ? '' : 's'} remaining`}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5">
            <p className="text-xs font-medium text-slate-500">Bills Logged</p>
            <p
              data-testid="kpi-bills-count"
              className="mt-1 font-mono-num text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl"
            >
              {activeTrip.expenses.length}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {(() => {
                const used = Array.from(
                  new Set(activeTrip.expenses.map((e) => e.currency))
                );
                return used.length > 0 ? used.join(', ') : 'No bills yet';
              })()}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5">
            <p className="text-xs font-medium text-slate-500">Settled Marks</p>
            <p
              data-testid="kpi-settled-count"
              className="mt-1 font-mono-num text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl"
            >
              {settledCount}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {settledCount === 0
                ? 'Tap Mark Settled below'
                : 'Recorded payments'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
