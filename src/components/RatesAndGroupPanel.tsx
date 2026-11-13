import { useState } from 'react';
import { Check, Download, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import type { CurrencyCode, ExchangeRates, Trip } from '../types';
import {
  CURRENCY_META,
  DEFAULT_EXCHANGE_RATES,
  SUPPORTED_CURRENCIES,
  formatExchangeRate,
} from '../utils/currency';
import { downloadTripCsv } from '../utils/exportCsv';

interface RatesAndGroupPanelProps {
  trip: Trip;
  canDeleteTrip: boolean;
  onUpdateRates: (rates: ExchangeRates) => void;
  onAddMember: (name: string) => void;
  onRemoveMember: (memberId: string) => string | null;
  onOpenEditMembers: () => void;
  onDeleteTrip: () => void;
  onResetDemoData: () => void;
}

export function RatesAndGroupPanel({
  trip,
  canDeleteTrip,
  onUpdateRates,
  onAddMember,
  onRemoveMember,
  onOpenEditMembers,
  onDeleteTrip,
  onResetDemoData,
}: RatesAndGroupPanelProps) {
  const rates = trip.rates ?? DEFAULT_EXCHANGE_RATES;
  const [newMemberName, setNewMemberName] = useState('');
  const [memberError, setMemberError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [exportedFile, setExportedFile] = useState<string | null>(null);

  const handleRateChange = (code: CurrencyCode, rawVal: string) => {
    const parsed = Number(rawVal);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    onUpdateRates({
      ...rates,
      [code]: parsed,
    });
  };

  const handleAddMemberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newMemberName.trim();
    if (!trimmed) {
      setMemberError('Enter a traveler name.');
      return;
    }
    if (trip.members.some((m) => m.name.toLowerCase() === trimmed.toLowerCase())) {
      setMemberError('That traveler is already in this trip.');
      return;
    }
    onAddMember(trimmed);
    setNewMemberName('');
    setMemberError(null);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Exchange Rates Card */}
      <section
        aria-label="Trip exchange rates"
        className="rounded-xl border border-slate-200 bg-white"
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Trip Exchange Rates
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Units per 1 USD · All bills auto-convert into {trip.homeCurrency}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onUpdateRates({ ...DEFAULT_EXCHANGE_RATES })}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset Defaults</span>
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {SUPPORTED_CURRENCIES.map((code) => {
            const meta = CURRENCY_META[code];
            const isUsd = code === 'USD';
            return (
              <div
                key={code}
                className="flex items-center justify-between gap-4 px-5 py-3.5"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {code} ({meta.symbol})
                  </p>
                  <p className="text-xs text-slate-500">
                    {meta.name} ·{' '}
                    <span className="font-mono-num">
                      {code === trip.homeCurrency
                        ? 'Trip Home Currency'
                        : formatExchangeRate(code, trip.homeCurrency, rates)}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor={`rate-${code}`} className="sr-only">
                    Exchange rate for {code} per 1 USD
                  </label>
                  <input
                    id={`rate-${code}`}
                    type="number"
                    step="0.01"
                    min="0.01"
                    disabled={isUsd}
                    value={rates[code]}
                    onChange={(e) => handleRateChange(code, e.target.value)}
                    className="min-h-[38px] w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-right font-mono-num text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500 focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Group Members & Trip Actions */}
      <div className="space-y-6">
        <section
          aria-label="Trip travelers"
          className="rounded-xl border border-slate-200 bg-white"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Trip Travelers ({trip.members.length})
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Add or manage people splitting bills on {trip.name}
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenEditMembers}
              className="min-h-[36px] shrink-0 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Edit Group Size
            </button>
          </div>

          <form
            onSubmit={handleAddMemberSubmit}
            className="border-b border-slate-100 px-5 py-3.5"
          >
            <div className="flex items-center gap-2">
              <label htmlFor="new-member-input" className="sr-only">
                Add traveler name
              </label>
              <input
                id="new-member-input"
                type="text"
                value={newMemberName}
                onChange={(e) => {
                  setNewMemberName(e.target.value);
                  setMemberError(null);
                }}
                placeholder="Add traveler name..."
                className="min-h-[40px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
              />
              <button
                type="submit"
                className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800"
              >
                <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Add</span>
              </button>
            </div>
            {memberError && (
              <p role="alert" className="mt-2 text-xs font-medium text-rose-700">
                {memberError}
              </p>
            )}
          </form>

          <ul className="divide-y divide-slate-100">
            {trip.members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: m.color }}
                    aria-hidden="true"
                  >
                    {m.initials}
                  </span>
                  <span className="text-sm font-medium text-slate-900">
                    {m.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const err = onRemoveMember(m.id);
                    setMemberError(err);
                  }}
                  aria-label={`Remove ${m.name}`}
                  className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-label="Trip storage controls"
          className="rounded-xl border border-slate-200 bg-white px-5 py-4"
        >
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Workspace Data
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            All trips, multi-currency bills, and settled marks save locally in your browser.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                const filename = downloadTripCsv(trip);
                setExportedFile(filename);
                window.setTimeout(() => {
                  setExportedFile((curr) => (curr === filename ? null : curr));
                }, 3000);
              }}
              className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-teal-700 bg-teal-50/70 px-3 py-1.5 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              {exportedFile ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Exported CSV</span>
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Export to CSV</span>
                </>
              )}
            </button>
            {canDeleteTrip && (
              <button
                type="button"
                onClick={onDeleteTrip}
                className="min-h-[38px] rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              >
                Delete Current Trip
              </button>
            )}
            {confirmReset ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onResetDemoData();
                    setConfirmReset(false);
                  }}
                  className="min-h-[38px] rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Confirm Reset Demo Data
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Restore Sample Trips
              </button>
            )}
          </div>
          {exportedFile && (
            <p
              role="status"
              data-testid="csv-export-status"
              className="mt-2 text-xs font-medium text-emerald-700"
            >
              Downloaded {exportedFile} ({trip.expenses.length} expenses,{' '}
              {trip.settlements.length} settlements)
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
