import { BellRing, RotateCcw, X } from 'lucide-react';
import type { CurrencyCode } from '../types';
import { formatCurrency } from '../utils/currency';

export interface ActivePaymentToast {
  id: string;
  settlementId?: string;
  fromName: string;
  toName: string;
  amount: number;
  currency: CurrencyCode;
  kind: 'settled' | 'undone';
  allSettled?: boolean;
}

interface PaymentToastProps {
  toast: ActivePaymentToast | null;
  onUndo?: (settlementId: string) => void;
  onDismiss: () => void;
}

export function PaymentToast({ toast, onUndo, onDismiss }: PaymentToastProps) {
  if (!toast) return null;

  const formatted = formatCurrency(toast.amount, toast.currency, {
    showCode: true,
  });

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="payment-toast"
      className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-6 sm:bottom-5 sm:w-[400px]"
    >
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            toast.kind === 'settled'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-slate-100 text-slate-700'
          }`}
        >
          <BellRing className="h-4 w-4" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-900">
            {toast.kind === 'settled'
              ? 'Suggested Payment Recorded'
              : 'Payment Unmarked'}
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            {toast.fromName} paid {toast.toName}{' '}
            <span className="font-mono-num font-semibold text-slate-900">
              {formatted}
            </span>
          </p>
          {toast.allSettled && toast.kind === 'settled' && (
            <p className="mt-1 text-xs font-medium text-emerald-700">
              All trip balances are now settled.
            </p>
          )}

          {toast.kind === 'settled' && toast.settlementId && onUndo && (
            <button
              type="button"
              onClick={() => onUndo(toast.settlementId!)}
              className="mt-2 inline-flex min-h-[32px] items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              <span>Undo Payment</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss payment notification"
          className="inline-flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
