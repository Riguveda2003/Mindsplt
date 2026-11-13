import { Plus, Split } from 'lucide-react';

export type ActiveTab = 'overview' | 'expenses' | 'balances' | 'settings';

interface HeaderBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenNewTrip: () => void;
  onOpenAddExpense: () => void;
}

export function HeaderBar({
  activeTab,
  onSelectTab,
  onOpenNewTrip,
  onOpenAddExpense,
}: HeaderBarProps) {
  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'balances', label: 'Balances' },
    { id: 'settings', label: 'Rates & Group' },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Brand wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('overview')}
          className="flex shrink-0 items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-white">
            <Split className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            mindsplt
          </span>
        </button>

        {/* Zone 2: Single-line navigation links */}
        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-6 md:flex"
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`whitespace-nowrap shrink-0 border-b-2 py-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-teal-700 ${
                  isActive
                    ? 'border-teal-700 text-slate-900'
                    : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onOpenNewTrip}
            className="whitespace-nowrap shrink-0 border-b-2 border-transparent py-4 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-teal-700"
          >
            New Trip
          </button>
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={onOpenAddExpense}
            className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-800 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add Bill</span>
          </button>
        </div>
      </div>
    </header>
  );
}
