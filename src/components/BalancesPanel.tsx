import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BellRing,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  RotateCcw,
} from 'lucide-react';
import type {
  CurrencyCode,
  DirectTransferSuggestion,
  ExchangeRates,
  Member,
  MemberSummary,
  PaymentNotification,
  SettlementRecord,
  TransferSuggestion,
} from '../types';
import {
  DEFAULT_EXCHANGE_RATES,
  convertAmount,
  formatCurrency,
} from '../utils/currency';

export type SuggestionMode = 'minimal' | 'direct';

interface BalancesPanelProps {
  tripName: string;
  members: Member[];
  summaries: MemberSummary[];
  transfers: TransferSuggestion[];
  directTransfers: DirectTransferSuggestion[];
  settlements: SettlementRecord[];
  notifications: PaymentNotification[];
  homeCurrency: CurrencyCode;
  billCurrencies: CurrencyCode[];
  rates?: ExchangeRates;
  onMarkSettled: (transfer: TransferSuggestion) => void;
  onUnmarkSettled: (settlementId: string) => void;
  onMarkAllNotificationsRead: () => void;
  onClearNotifications: () => void;
}

export function BalancesPanel({
  tripName,
  members,
  summaries,
  transfers,
  directTransfers,
  settlements,
  notifications,
  homeCurrency,
  billCurrencies,
  rates = DEFAULT_EXCHANGE_RATES,
  onMarkSettled,
  onUnmarkSettled,
  onMarkAllNotificationsRead,
  onClearNotifications,
}: BalancesPanelProps) {
  const [mode, setMode] = useState<SuggestionMode>('minimal');
  const [memberFilter, setMemberFilter] = useState<string>('ALL');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const memberMap = useMemo(() => {
    const map = new Map<string, Member>();
    members.forEach((m) => map.set(m.id, m));
    return map;
  }, [members]);

  const directMap = useMemo(() => {
    const map = new Map<string, DirectTransferSuggestion>();
    directTransfers.forEach((d) => map.set(d.id, d));
    return map;
  }, [directTransfers]);

  const activeList = useMemo(() => {
    const base: Array<TransferSuggestion | DirectTransferSuggestion> =
      mode === 'minimal' ? transfers : directTransfers;
    if (memberFilter === 'ALL') return base;
    return base.filter(
      (t) => t.fromId === memberFilter || t.toId === memberFilter
    );
  }, [mode, transfers, directTransfers, memberFilter]);

  const alternateCurrencies = useMemo(
    () => billCurrencies.filter((c) => c !== homeCurrency).slice(0, 2),
    [billCurrencies, homeCurrency]
  );

  const sortedSettlements = useMemo(
    () => [...settlements].sort((a, b) => b.settledAt.localeCompare(a.settledAt)),
    [settlements]
  );

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopySuggestion = async (
    transfer: TransferSuggestion,
    fromName: string,
    toName: string
  ) => {
    const amtText = formatCurrency(transfer.amountHome, homeCurrency, {
      showCode: true,
    });
    const text = `${fromName} pays ${toName} ${amtText} to settle ${tripName}`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      // Clipboard API may be restricted in headless contexts; still show feedback
    }
    setCopiedId(transfer.id);
    window.setTimeout(() => {
      setCopiedId((curr) => (curr === transfer.id ? null : curr));
    }, 1800);
  };

  return (
    <div className="space-y-5">
      {/* Section 1: Suggestive Payments & One-Tap Settled */}
      <section
        aria-label="Suggested payments to settle bills"
        className="rounded-xl border border-slate-200 bg-white"
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Suggested Payments
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {mode === 'minimal'
                  ? directTransfers.length > transfers.length && transfers.length > 0
                    ? `${transfers.length} simplified payments settle all bills (down from ${directTransfers.length} pairs)`
                    : `Minimum transfers to settle everyone in ${homeCurrency}`
                  : `Direct pairwise payments from shared bills in ${homeCurrency}`}
              </p>
            </div>

            <div
              role="group"
              aria-label="Payment suggestion mode"
              className="inline-flex shrink-0 items-center self-start rounded-lg border border-slate-200 bg-slate-100 p-0.5"
            >
              <button
                type="button"
                aria-pressed={mode === 'minimal'}
                onClick={() => setMode('minimal')}
                className={`min-h-[32px] whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  mode === 'minimal'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Minimal ({transfers.length})
              </button>
              <button
                type="button"
                aria-pressed={mode === 'direct'}
                onClick={() => setMode('direct')}
                className={`min-h-[32px] whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  mode === 'direct'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                By Bills ({directTransfers.length})
              </button>
            </div>
          </div>

          {members.length > 0 && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <label
                htmlFor="payment-person-filter"
                className="text-xs font-medium text-slate-500"
              >
                Show payments for
              </label>
              <select
                id="payment-person-filter"
                value={memberFilter}
                onChange={(e) => setMemberFilter(e.target.value)}
                className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
              >
                <option value="ALL">All travelers</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {activeList.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="mt-2.5 text-sm font-semibold text-slate-900">
              {memberFilter === 'ALL'
                ? 'All settled up'
                : `No payments needed for ${memberMap.get(memberFilter)?.name ?? 'this traveler'}`}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {memberFilter === 'ALL'
                ? 'No outstanding balances remain for this trip.'
                : 'Select All travelers to view other group payments.'}
            </p>
          </div>
        ) : (
          <ul data-testid="pending-transfers-list" className="divide-y divide-slate-100">
            {activeList.map((transfer) => {
              const fromMember = memberMap.get(transfer.fromId);
              const toMember = memberMap.get(transfer.toId);
              const fromName = fromMember?.name ?? 'Member';
              const toName = toMember?.name ?? 'Member';
              const formattedAmt = formatCurrency(transfer.amountHome, homeCurrency);
              const directPair =
                'billItems' in transfer ? transfer : directMap.get(transfer.id);
              const isExpanded = Boolean(expandedIds[transfer.id]);
              const isCopied = copiedId === transfer.id;

              const altAmounts = alternateCurrencies.map((cur) =>
                formatCurrency(
                  convertAmount(transfer.amountHome, homeCurrency, cur, rates),
                  cur,
                  { showCode: true }
                )
              );

              return (
                <li key={transfer.id} className="px-5 py-3.5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      {/* Sender -> Receiver with avatars */}
                      <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-900">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                            style={{ backgroundColor: fromMember?.color ?? '#0f766e' }}
                            aria-hidden="true"
                          >
                            {fromMember?.initials ?? '?'}
                          </span>
                          <span className="truncate">{fromName}</span>
                        </span>
                        <span className="text-xs font-normal text-slate-500">
                          pays
                        </span>
                        <ArrowRight
                          className="h-3.5 w-3.5 shrink-0 text-slate-400"
                          aria-hidden="true"
                        />
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                            style={{ backgroundColor: toMember?.color ?? '#1d4ed8' }}
                            aria-hidden="true"
                          >
                            {toMember?.initials ?? '?'}
                          </span>
                          <span className="truncate">{toName}</span>
                        </span>
                      </div>

                      {/* Primary suggested amount + FX equivalents */}
                      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="font-mono-num text-base font-semibold text-amber-700">
                          {formattedAmt}
                        </span>
                        <span className="text-xs text-slate-500">
                          in {homeCurrency}
                        </span>
                        {altAmounts.length > 0 && (
                          <span className="font-mono-num text-xs text-slate-500">
                            · ≈ {altAmounts.join(' / ')}
                          </span>
                        )}
                      </div>

                      {/* Expandable reason / shared bills link */}
                      {(directPair?.billItems.length || mode === 'minimal') && (
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => toggleExpand(transfer.id)}
                          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900"
                        >
                          <span>
                            {directPair?.billItems.length
                              ? `Based on ${directPair.billItems.length} shared bill${directPair.billItems.length === 1 ? '' : 's'}`
                              : 'Consolidated net balance'}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                        </button>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleCopySuggestion(transfer, fromName, toName)
                        }
                        aria-label={`Copy payment note ${fromName} pays ${toName} ${formattedAmt}`}
                        className="inline-flex min-h-[44px] items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                      >
                        {isCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                            <span className="text-emerald-700">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => onMarkSettled(transfer)}
                        aria-label={`Mark ${fromName} to ${toName} ${formattedAmt} settled`}
                        className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-teal-700 bg-teal-50/70 px-3.5 py-2 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-700 hover:text-white active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Mark Settled</span>
                      </button>
                    </div>
                  </div>

                  {/* Expanded Bill Breakdown */}
                  {isExpanded && (
                    <div
                      data-testid={`breakdown-${transfer.id}`}
                      className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-xs"
                    >
                      {directPair && directPair.billItems.length > 0 ? (
                        <ul className="space-y-1.5">
                          {directPair.billItems.map((item) => {
                            const isDebt = item.direction === 'from_owes_to';
                            return (
                              <li
                                key={`${item.expenseId}-${item.direction}`}
                                className="flex items-center justify-between gap-2"
                              >
                                <span className="truncate text-slate-700">
                                  {item.title}{' '}
                                  <span className="text-slate-400">
                                    ({item.date})
                                  </span>
                                </span>
                                <span
                                  className={`shrink-0 font-mono-num font-medium ${
                                    isDebt ? 'text-rose-700' : 'text-emerald-700'
                                  }`}
                                >
                                  {isDebt ? '+' : '-'}
                                  {formatCurrency(item.shareHome, homeCurrency)}
                                </span>
                              </li>
                            );
                          })}
                          {mode === 'minimal' && (
                            <li className="border-t border-slate-200 pt-1.5 text-slate-500">
                              Simplified payment also consolidates {fromName}&apos;s other trip balances into one transfer to {toName}.
                            </li>
                          )}
                        </ul>
                      ) : (
                        <p className="text-slate-600">
                          Consolidated across multiple group bills to minimize total transfers.
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Section 2: Settled Marks History */}
      {sortedSettlements.length > 0 && (
        <section
          aria-label="Settled marks"
          className="rounded-xl border border-slate-200 bg-white"
        >
          <div className="border-b border-slate-200 px-5 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Settled Marks
              </h3>
              <span className="font-mono-num text-xs text-slate-500">
                {sortedSettlements.length} settled
              </span>
            </div>
          </div>

          <ul data-testid="settled-list" className="divide-y divide-slate-100">
            {sortedSettlements.map((item) => {
              const fromName = memberMap.get(item.fromId)?.name ?? 'Member';
              const toName = memberMap.get(item.toId)?.name ?? 'Member';
              const convertedAmount = convertAmount(
                item.amount,
                item.currency,
                homeCurrency,
                rates
              );
              const dateLabel = item.settledAt.slice(0, 10);

              return (
                <li key={item.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>Settled</span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="font-normal text-slate-500">{dateLabel}</span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-slate-800">
                        {fromName} paid {toName}
                      </p>
                      <p className="font-mono-num text-xs text-slate-500">
                        {formatCurrency(convertedAmount, homeCurrency)}
                        {item.currency !== homeCurrency && (
                          <span className="ml-1.5">
                            ({formatCurrency(item.amount, item.currency, { showCode: true })})
                          </span>
                        )}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onUnmarkSettled(item.id)}
                      aria-label={`Undo settled mark ${fromName} to ${toName}`}
                      className="inline-flex min-h-[40px] shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      <span>Undo</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Section 2b: Payment Notifications Feed */}
      {notifications.length > 0 && (
        <section
          aria-label="Payment notifications"
          data-testid="payment-notifications-feed"
          className="rounded-xl border border-slate-200 bg-white"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-teal-700" aria-hidden="true" />
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Payment Notifications
              </h3>
              {notifications.some((n) => !n.read) && (
                <span className="font-mono-num text-xs font-semibold text-teal-700">
                  · {notifications.filter((n) => !n.read).length} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {notifications.some((n) => !n.read) && (
                <button
                  type="button"
                  onClick={onMarkAllNotificationsRead}
                  className="text-xs font-medium text-teal-700 hover:text-teal-900"
                >
                  Mark read
                </button>
              )}
              <button
                type="button"
                onClick={onClearNotifications}
                className="text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                Clear
              </button>
            </div>
          </div>

          <ul className="divide-y divide-slate-100">
            {notifications.map((notif) => {
              const converted = convertAmount(
                notif.amount,
                notif.currency,
                homeCurrency,
                rates
              );
              const timeStr = notif.createdAt.slice(0, 16).replace('T', ' ');
              return (
                <li
                  key={notif.id}
                  className={`flex items-center justify-between gap-3 px-5 py-3 text-xs ${
                    notif.read ? 'bg-white' : 'bg-teal-50/40'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {notif.fromName} paid {notif.toName}{' '}
                      <span className="font-mono-num font-semibold text-emerald-700">
                        {formatCurrency(converted, homeCurrency)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-slate-500">
                      {notif.read ? 'Read' : 'New payment'} · {timeStr}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Section 3: Member Net Positions */}
      <section
        aria-label="Member net balances"
        className="rounded-xl border border-slate-200 bg-white"
      >
        <div className="border-b border-slate-200 px-5 py-3.5">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Member Positions ({homeCurrency})
          </h3>
        </div>
        <ul className="divide-y divide-slate-100">
          {summaries.map((s) => {
            const member = memberMap.get(s.memberId);
            if (!member) return null;
            const isPositive = s.netBalanceHome > 0.005;
            const isNegative = s.netBalanceHome < -0.005;

            return (
              <li
                key={member.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: member.color }}
                    aria-hidden="true"
                  >
                    {member.initials}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {member.name}
                    </p>
                    <p className="font-mono-num text-xs text-slate-500">
                      Paid {formatCurrency(s.totalPaidHome, homeCurrency)} · Share{' '}
                      {formatCurrency(s.totalShareHome, homeCurrency)}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <p
                    className={`font-mono-num text-sm font-semibold ${
                      isPositive
                        ? 'text-emerald-700'
                        : isNegative
                          ? 'text-rose-700'
                          : 'text-slate-600'
                    }`}
                  >
                    {formatCurrency(s.netBalanceHome, homeCurrency, { signed: true })}
                  </p>
                  <p className="text-xs text-slate-500">
                    {isPositive ? 'Gets back' : isNegative ? 'Owes' : 'Settled'}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
