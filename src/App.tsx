import { useEffect, useMemo, useRef, useState } from 'react';
import { BalancesPanel } from './components/BalancesPanel';
import { EditMembersModal } from './components/EditMembersModal';
import { ExpenseModal } from './components/ExpenseModal';
import { ExpensesPanel } from './components/ExpensesPanel';
import { HeaderBar, type ActiveTab } from './components/HeaderBar';
import { NewTripModal } from './components/NewTripModal';
import {
  PaymentToast,
  type ActivePaymentToast,
} from './components/PaymentToast';
import { RatesAndGroupPanel } from './components/RatesAndGroupPanel';
import { SpendingChart } from './components/SpendingChart';
import { TripSummaryStrip } from './components/TripSummaryStrip';
import type {
  AppState,
  CurrencyCode,
  ExchangeRates,
  Expense,
  Member,
  PaymentNotification,
  SettlementRecord,
  TransferSuggestion,
  Trip,
} from './types';
import { DEFAULT_EXCHANGE_RATES } from './utils/currency';
import {
  applyTripMembersUpdate,
  calculateDailySpendSeries,
  calculateDirectPairwiseTransfers,
  calculateMemberSpendSeries,
  calculateMemberSummaries,
  calculateSimplifiedTransfers,
  calculateTotalUnsettledHome,
  calculateTripTotalSpendHome,
} from './utils/ledger';
import {
  createInitialState,
  loadAppState,
  makeInitials,
  pickMemberColor,
  saveAppState,
} from './utils/storage';

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export default function App() {
  const [state, setState] = useState<AppState>(() => loadAppState());
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isNewTripModalOpen, setIsNewTripModalOpen] = useState(false);
  const [isEditMembersOpen, setIsEditMembersOpen] = useState(false);
  const [activeToast, setActiveToast] = useState<ActivePaymentToast | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    saveAppState(state);
  }, [state]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const activeTrip = useMemo(
    () =>
      state.trips.find((t) => t.id === state.activeTripId) ?? state.trips[0],
    [state]
  );

  const rates = activeTrip.rates ?? DEFAULT_EXCHANGE_RATES;

  const memberSummaries = useMemo(
    () => calculateMemberSummaries(activeTrip, rates),
    [activeTrip, rates]
  );

  const transfers = useMemo(
    () => calculateSimplifiedTransfers(memberSummaries, activeTrip.homeCurrency),
    [memberSummaries, activeTrip.homeCurrency]
  );

  const directTransfers = useMemo(
    () => calculateDirectPairwiseTransfers(activeTrip, rates),
    [activeTrip, rates]
  );

  const billCurrencies = useMemo(
    () => Array.from(new Set(activeTrip.expenses.map((e) => e.currency))),
    [activeTrip.expenses]
  );

  const totalSpendHome = useMemo(
    () => calculateTripTotalSpendHome(activeTrip, rates),
    [activeTrip, rates]
  );

  const unsettledTotalHome = useMemo(
    () => calculateTotalUnsettledHome(transfers, activeTrip.homeCurrency),
    [transfers, activeTrip.homeCurrency]
  );

  const dailySpendSeries = useMemo(
    () => calculateDailySpendSeries(activeTrip, rates),
    [activeTrip, rates]
  );

  const memberSpendSeries = useMemo(
    () => calculateMemberSpendSeries(activeTrip, rates),
    [activeTrip, rates]
  );

  const updateActiveTrip = (updater: (trip: Trip) => Trip) => {
    setState((prev) => ({
      ...prev,
      trips: prev.trips.map((t) => (t.id === activeTrip.id ? updater(t) : t)),
    }));
  };

  const handleSelectTrip = (tripId: string) => {
    setState((prev) => ({ ...prev, activeTripId: tripId }));
  };

  const handleChangeHomeCurrency = (homeCurrency: CurrencyCode) => {
    updateActiveTrip((trip) => ({ ...trip, homeCurrency }));
  };

  const handleSaveExpense = (
    expenseData: Omit<Expense, 'id' | 'createdAt'>,
    existingId?: string
  ) => {
    updateActiveTrip((trip) => {
      if (existingId) {
        return {
          ...trip,
          expenses: trip.expenses.map((exp) =>
            exp.id === existingId ? { ...exp, ...expenseData } : exp
          ),
        };
      }
      const newExpense: Expense = {
        ...expenseData,
        id: makeId('exp'),
        createdAt: new Date().toISOString(),
      };
      return {
        ...trip,
        expenses: [newExpense, ...trip.expenses],
      };
    });
    setIsExpenseModalOpen(false);
    setEditingExpense(null);
  };

  const handleDeleteExpense = (expenseId: string) => {
    updateActiveTrip((trip) => ({
      ...trip,
      expenses: trip.expenses.filter((e) => e.id !== expenseId),
    }));
  };

  const showPaymentToast = (toast: ActivePaymentToast) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setActiveToast(toast);
    toastTimerRef.current = window.setTimeout(() => {
      setActiveToast((curr) => (curr?.id === toast.id ? null : curr));
    }, 6000);
  };

  const handleMarkSettled = (transfer: TransferSuggestion) => {
    const nowIso = new Date().toISOString();
    const settlementId = makeId('set');
    const fromName =
      activeTrip.members.find((m) => m.id === transfer.fromId)?.name ?? 'Member';
    const toName =
      activeTrip.members.find((m) => m.id === transfer.toId)?.name ?? 'Member';

    const newRecord: SettlementRecord = {
      id: settlementId,
      fromId: transfer.fromId,
      toId: transfer.toId,
      amount: transfer.amountHome,
      currency: activeTrip.homeCurrency,
      settledAt: nowIso,
    };

    const newNotification: PaymentNotification = {
      id: makeId('notif'),
      settlementId,
      fromId: transfer.fromId,
      toId: transfer.toId,
      fromName,
      toName,
      amount: transfer.amountHome,
      currency: activeTrip.homeCurrency,
      createdAt: nowIso,
      read: false,
    };

    const nextTripPreview: Trip = {
      ...activeTrip,
      settlements: [newRecord, ...activeTrip.settlements],
    };
    const nextSummaries = calculateMemberSummaries(nextTripPreview, rates);
    const nextTransfers = calculateSimplifiedTransfers(
      nextSummaries,
      activeTrip.homeCurrency
    );

    updateActiveTrip((trip) => ({
      ...trip,
      settlements: [newRecord, ...trip.settlements],
      notifications: [newNotification, ...(trip.notifications ?? [])],
    }));

    showPaymentToast({
      id: newNotification.id,
      settlementId,
      fromName,
      toName,
      amount: transfer.amountHome,
      currency: activeTrip.homeCurrency,
      kind: 'settled',
      allSettled: nextTransfers.length === 0,
    });
  };

  const handleUnmarkSettled = (settlementId: string) => {
    const existing = activeTrip.settlements.find((s) => s.id === settlementId);
    updateActiveTrip((trip) => ({
      ...trip,
      settlements: trip.settlements.filter((s) => s.id !== settlementId),
      notifications: (trip.notifications ?? []).filter(
        (n) => n.settlementId !== settlementId
      ),
    }));
    if (existing) {
      const fromName =
        activeTrip.members.find((m) => m.id === existing.fromId)?.name ?? 'Member';
      const toName =
        activeTrip.members.find((m) => m.id === existing.toId)?.name ?? 'Member';
      showPaymentToast({
        id: makeId('toast'),
        fromName,
        toName,
        amount: existing.amount,
        currency: existing.currency,
        kind: 'undone',
      });
    }
  };

  const handleMarkAllNotificationsRead = () => {
    updateActiveTrip((trip) => ({
      ...trip,
      notifications: (trip.notifications ?? []).map((n) => ({
        ...n,
        read: true,
      })),
    }));
  };

  const handleClearNotifications = () => {
    updateActiveTrip((trip) => ({
      ...trip,
      notifications: [],
    }));
  };

  const handleSaveMembers = (nextMembers: Member[]) => {
    updateActiveTrip((trip) => applyTripMembersUpdate(trip, nextMembers));
  };

  const handleUpdateRates = (nextRates: ExchangeRates) => {
    updateActiveTrip((trip) => ({
      ...trip,
      rates: nextRates,
    }));
  };

  const handleAddMember = (name: string) => {
    updateActiveTrip((trip) => {
      const nextMember: Member = {
        id: makeId('m'),
        name,
        initials: makeInitials(name),
        color: pickMemberColor(trip.members.length),
      };
      return {
        ...trip,
        members: [...trip.members, nextMember],
      };
    });
  };

  const handleRemoveMember = (memberId: string): string | null => {
    if (activeTrip.members.length <= 2) {
      return 'A trip needs at least 2 travelers.';
    }
    const usedInExpense = activeTrip.expenses.some(
      (e) => e.paidById === memberId || e.participantIds.includes(memberId)
    );
    if (usedInExpense) {
      return 'Remove or edit bills involving this traveler before removing them.';
    }
    const usedInSettlement = activeTrip.settlements.some(
      (s) => s.fromId === memberId || s.toId === memberId
    );
    if (usedInSettlement) {
      return 'Undo settled marks involving this traveler before removing them.';
    }
    updateActiveTrip((trip) => ({
      ...trip,
      members: trip.members.filter((m) => m.id !== memberId),
    }));
    return null;
  };

  const handleCreateTrip = ({
    name,
    homeCurrency,
    memberNames,
  }: {
    name: string;
    homeCurrency: CurrencyCode;
    memberNames: string[];
  }) => {
    const members: Member[] = memberNames.map((memberName, idx) => ({
      id: makeId('m'),
      name: memberName,
      initials: makeInitials(memberName),
      color: pickMemberColor(idx),
    }));
    const newTrip: Trip = {
      id: makeId('trip'),
      name,
      subtitle: `${members.length} travelers`,
      homeCurrency,
      members,
      expenses: [],
      settlements: [],
      rates: { ...DEFAULT_EXCHANGE_RATES },
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({
      trips: [newTrip, ...prev.trips],
      activeTripId: newTrip.id,
    }));
    setIsNewTripModalOpen(false);
    setActiveTab('overview');
  };

  const handleDeleteTrip = () => {
    if (state.trips.length <= 1) return;
    setState((prev) => {
      const remaining = prev.trips.filter((t) => t.id !== activeTrip.id);
      return {
        trips: remaining,
        activeTripId: remaining[0].id,
      };
    });
    setActiveTab('overview');
  };

  const handleResetDemoData = () => {
    const fresh = createInitialState();
    setState(fresh);
    setActiveTab('overview');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <HeaderBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenNewTrip={() => setIsNewTripModalOpen(true)}
        onOpenAddExpense={() => {
          setEditingExpense(null);
          setIsExpenseModalOpen(true);
        }}
      />

      <TripSummaryStrip
        trips={state.trips}
        activeTrip={activeTrip}
        totalSpendHome={totalSpendHome}
        unsettledTotalHome={unsettledTotalHome}
        unsettledCount={transfers.length}
        settledCount={activeTrip.settlements.length}
        onSelectTrip={handleSelectTrip}
        onChangeHomeCurrency={handleChangeHomeCurrency}
        onOpenNewTrip={() => setIsNewTripModalOpen(true)}
        onOpenEditMembers={() => setIsEditMembersOpen(true)}
      />

      {/* Mobile Navigation Tabs */}
      <div className="border-b border-slate-200 bg-white px-4 py-2 md:hidden">
        <div
          role="tablist"
          aria-label="Trip sections"
          className="grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1"
        >
          {(
            [
              { id: 'overview', label: 'Overview' },
              { id: 'expenses', label: 'Bills' },
              { id: 'balances', label: 'Balances' },
              { id: 'settings', label: 'Rates' },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[38px] whitespace-nowrap rounded-md px-2 text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <SpendingChart
              homeCurrency={activeTrip.homeCurrency}
              dailySeries={dailySpendSeries}
              memberSeries={memberSpendSeries}
              hasExpenses={activeTrip.expenses.length > 0}
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-6">
                <ExpensesPanel
                  expenses={activeTrip.expenses}
                  members={activeTrip.members}
                  homeCurrency={activeTrip.homeCurrency}
                  rates={rates}
                  onAddExpense={() => {
                    setEditingExpense(null);
                    setIsExpenseModalOpen(true);
                  }}
                  onEditExpense={(exp) => {
                    setEditingExpense(exp);
                    setIsExpenseModalOpen(true);
                  }}
                  onDeleteExpense={handleDeleteExpense}
                />
              </div>

              <div className="lg:col-span-6">
                <BalancesPanel
                  tripName={activeTrip.name}
                  members={activeTrip.members}
                  summaries={memberSummaries}
                  transfers={transfers}
                  directTransfers={directTransfers}
                  settlements={activeTrip.settlements}
                  notifications={activeTrip.notifications ?? []}
                  homeCurrency={activeTrip.homeCurrency}
                  billCurrencies={billCurrencies}
                  rates={rates}
                  onMarkSettled={handleMarkSettled}
                  onUnmarkSettled={handleUnmarkSettled}
                  onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
                  onClearNotifications={handleClearNotifications}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'expenses' && (
          <ExpensesPanel
            expenses={activeTrip.expenses}
            members={activeTrip.members}
            homeCurrency={activeTrip.homeCurrency}
            rates={rates}
            onAddExpense={() => {
              setEditingExpense(null);
              setIsExpenseModalOpen(true);
            }}
            onEditExpense={(exp) => {
              setEditingExpense(exp);
              setIsExpenseModalOpen(true);
            }}
            onDeleteExpense={handleDeleteExpense}
          />
        )}

        {activeTab === 'balances' && (
          <div className="mx-auto max-w-3xl">
            <BalancesPanel
              tripName={activeTrip.name}
              members={activeTrip.members}
              summaries={memberSummaries}
              transfers={transfers}
              directTransfers={directTransfers}
              settlements={activeTrip.settlements}
              notifications={activeTrip.notifications ?? []}
              homeCurrency={activeTrip.homeCurrency}
              billCurrencies={billCurrencies}
              rates={rates}
              onMarkSettled={handleMarkSettled}
              onUnmarkSettled={handleUnmarkSettled}
              onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
              onClearNotifications={handleClearNotifications}
            />
          </div>
        )}

        {activeTab === 'settings' && (
          <RatesAndGroupPanel
            trip={activeTrip}
            canDeleteTrip={state.trips.length > 1}
            onUpdateRates={handleUpdateRates}
            onAddMember={handleAddMember}
            onRemoveMember={handleRemoveMember}
            onOpenEditMembers={() => setIsEditMembersOpen(true)}
            onDeleteTrip={handleDeleteTrip}
            onResetDemoData={handleResetDemoData}
          />
        )}
      </main>

      <ExpenseModal
        isOpen={isExpenseModalOpen}
        editingExpense={editingExpense}
        members={activeTrip.members}
        homeCurrency={activeTrip.homeCurrency}
        rates={rates}
        onClose={() => {
          setIsExpenseModalOpen(false);
          setEditingExpense(null);
        }}
        onSave={handleSaveExpense}
      />

      <NewTripModal
        isOpen={isNewTripModalOpen}
        onClose={() => setIsNewTripModalOpen(false)}
        onCreateTrip={handleCreateTrip}
      />

      <EditMembersModal
        isOpen={isEditMembersOpen}
        trip={activeTrip}
        onClose={() => setIsEditMembersOpen(false)}
        onSaveMembers={handleSaveMembers}
      />

      <PaymentToast
        toast={activeToast}
        onUndo={(settlementId) => handleUnmarkSettled(settlementId)}
        onDismiss={() => setActiveToast(null)}
      />
    </div>
  );
}
