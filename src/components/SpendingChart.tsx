import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import type { CurrencyCode } from '../types';
import { CURRENCY_META, formatCurrency } from '../utils/currency';
import type { DailySpendPoint, MemberSpendPoint } from '../utils/ledger';

type ChartMode = 'member' | 'daily';

interface SpendingChartProps {
  homeCurrency: CurrencyCode;
  dailySeries: DailySpendPoint[];
  memberSeries: MemberSpendPoint[];
  hasExpenses: boolean;
}

function formatAxisTick(value: number, currency: CurrencyCode): string {
  const symbol = CURRENCY_META[currency].symbol;
  if (Math.abs(value) >= 100000) {
    return `${symbol}${(value / 1000).toFixed(0)}k`;
  }
  if (Math.abs(value) >= 1000) {
    const k = value / 1000;
    return `${symbol}${Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `${symbol}${Math.round(value)}`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
    payload?: DailySpendPoint | MemberSpendPoint;
  }>;
  mode: ChartMode;
  homeCurrency: CurrencyCode;
}

function ChartTooltip({
  active,
  payload,
  mode,
  homeCurrency,
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const raw = payload[0]?.payload;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      {mode === 'daily' && raw && 'date' in raw ? (
        <p className="font-semibold text-slate-900">
          {raw.date}{' '}
          <span className="font-normal text-slate-500">
            · {raw.billCount} bill{raw.billCount === 1 ? '' : 's'}
          </span>
        </p>
      ) : raw && 'name' in raw ? (
        <p className="font-semibold text-slate-900">{raw.name}</p>
      ) : null}

      <div className="mt-1.5 space-y-1">
        {payload.map((entry, idx) => (
          <div
            key={`${entry.name ?? idx}`}
            className="flex items-center justify-between gap-4"
          >
            <span className="flex items-center gap-1.5 text-slate-600">
              <span
                className="inline-block h-2 w-2 rounded-xs"
                style={{ backgroundColor: entry.color ?? '#0f766e' }}
                aria-hidden="true"
              />
              <span>{entry.name}</span>
            </span>
            <span className="font-mono-num font-semibold text-slate-900">
              {formatCurrency(Number(entry.value ?? 0), homeCurrency, {
                showCode: true,
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SpendingChart({
  homeCurrency,
  dailySeries,
  memberSeries,
  hasExpenses,
}: SpendingChartProps) {
  const [mode, setMode] = useState<ChartMode>('member');

  const summaryText = useMemo(() => {
    if (mode === 'member') {
      return `Paid vs. fair share per traveler in ${homeCurrency}`;
    }
    return `Daily spending totals converted to ${homeCurrency}`;
  }, [mode, homeCurrency]);

  return (
    <section
      aria-label="Spending breakdown chart"
      data-testid="spending-chart-card"
      className="rounded-xl border border-slate-200 bg-white"
    >
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900">
            Spending Breakdown
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{summaryText}</p>
        </div>

        <div
          role="group"
          aria-label="Chart breakdown mode"
          className="inline-flex shrink-0 items-center self-start rounded-lg border border-slate-200 bg-slate-100 p-0.5 sm:self-auto"
        >
          <button
            type="button"
            aria-pressed={mode === 'member'}
            onClick={() => setMode('member')}
            className={`min-h-[32px] whitespace-nowrap rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              mode === 'member'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            By Member
          </button>
          <button
            type="button"
            aria-pressed={mode === 'daily'}
            onClick={() => setMode('daily')}
            className={`min-h-[32px] whitespace-nowrap rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              mode === 'daily'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Over Time
          </button>
        </div>
      </div>

      {!hasExpenses ? (
        <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400">
            <BarChart3 className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="mt-2.5 text-sm font-medium text-slate-900">
            No spending data to chart yet
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Add your first bill to visualize spending by traveler and date.
          </p>
        </div>
      ) : (
        <div className="px-3 pb-4 pt-5 sm:px-5">
          <div className="h-[250px] w-full" data-testid="spending-chart-viewport">
            <ResponsiveContainer width="100%" height="100%">
              {mode === 'member' ? (
                <BarChart
                  data={memberSeries}
                  margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                  barGap={6}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis
                    dataKey="shortName"
                    tick={{ fontSize: 12, fill: '#475569' }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => formatAxisTick(Number(v), homeCurrency)}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    width={62}
                  />
                  <Tooltip
                    cursor={{ fill: '#f1f5f9' }}
                    content={
                      <ChartTooltip mode="member" homeCurrency={homeCurrency} />
                    }
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                    iconType="square"
                    iconSize={10}
                  />
                  <Bar
                    dataKey="paidHome"
                    name="Paid"
                    fill="#0f766e"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={42}
                  />
                  <Bar
                    dataKey="shareHome"
                    name="Fair Share"
                    fill="#94a3b8"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={42}
                  />
                </BarChart>
              ) : (
                <BarChart
                  data={dailySeries}
                  margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: '#475569' }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => formatAxisTick(Number(v), homeCurrency)}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    width={62}
                  />
                  <Tooltip
                    cursor={{ fill: '#f1f5f9' }}
                    content={
                      <ChartTooltip mode="daily" homeCurrency={homeCurrency} />
                    }
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                    iconType="square"
                    iconSize={10}
                  />
                  <Bar
                    dataKey="totalHome"
                    name={`Daily Spend (${homeCurrency})`}
                    fill="#0f766e"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}
