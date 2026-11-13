import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { CurrencyCode } from '../types';
import { CURRENCY_META, SUPPORTED_CURRENCIES } from '../utils/currency';

interface NewTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTrip: (data: {
    name: string;
    homeCurrency: CurrencyCode;
    memberNames: string[];
  }) => void;
}

export function NewTripModal({
  isOpen,
  onClose,
  onCreateTrip,
}: NewTripModalProps) {
  const [name, setName] = useState('');
  const [homeCurrency, setHomeCurrency] = useState<CurrencyCode>('USD');
  const [membersText, setMembersText] = useState('Aarav, Maya, Liam');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setHomeCurrency('USD');
    setMembersText('Aarav, Maya, Liam');
    setError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const parsedMembers = membersText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!trimmedName) {
      setError('Please enter a trip name.');
      return;
    }
    if (parsedMembers.length < 2) {
      setError('Enter at least 2 traveler names separated by commas.');
      return;
    }

    onCreateTrip({
      name: trimmedName,
      homeCurrency,
      memberNames: Array.from(new Set(parsedMembers)),
    });
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
        aria-labelledby="new-trip-title"
        className="w-full max-w-md rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2
            id="new-trip-title"
            className="font-display text-base font-bold text-slate-900"
          >
            Create New Trip
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close new trip dialog"
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5" noValidate>
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
              htmlFor="new-trip-name"
              className="block text-xs font-semibold text-slate-700"
            >
              Trip Name
            </label>
            <input
              id="new-trip-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Lisbon & Porto Spring"
              className="mt-1.5 min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
            />
          </div>

          <div>
            <label
              htmlFor="new-trip-currency"
              className="block text-xs font-semibold text-slate-700"
            >
              Trip Home Currency
            </label>
            <select
              id="new-trip-currency"
              value={homeCurrency}
              onChange={(e) => setHomeCurrency(e.target.value as CurrencyCode)}
              className="mt-1.5 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
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
              htmlFor="new-trip-members"
              className="block text-xs font-semibold text-slate-700"
            >
              Travelers (comma-separated)
            </label>
            <input
              id="new-trip-members"
              type="text"
              value={membersText}
              onChange={(e) => setMembersText(e.target.value)}
              placeholder="Aarav, Maya, Liam"
              className="mt-1.5 min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
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
              Create Trip
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
