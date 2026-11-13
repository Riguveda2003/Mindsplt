import type { CurrencyCode, ExchangeRates } from '../types';

export interface CurrencyMeta {
  code: CurrencyCode;
  symbol: string;
  name: string;
  decimals: number;
  locale: string;
}

export const SUPPORTED_CURRENCIES: CurrencyCode[] = ['INR', 'USD', 'EUR', 'JPY'];

export const CURRENCY_META: Record<CurrencyCode, CurrencyMeta> = {
  INR: {
    code: 'INR',
    symbol: '₹',
    name: 'Indian Rupee',
    decimals: 2,
    locale: 'en-IN',
  },
  USD: {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    decimals: 2,
    locale: 'en-US',
  },
  EUR: {
    code: 'EUR',
    symbol: '€',
    name: 'Euro',
    decimals: 2,
    locale: 'en-IE',
  },
  JPY: {
    code: 'JPY',
    symbol: '¥',
    name: 'Japanese Yen',
    decimals: 0,
    locale: 'ja-JP',
  },
};

/**
 * Default FX rates expressed as units of currency per 1 USD.
 */
export const DEFAULT_EXCHANGE_RATES: ExchangeRates = {
  USD: 1,
  INR: 84.5,
  EUR: 0.92,
  JPY: 152.0,
};

export function roundToCurrency(amount: number, currency: CurrencyCode): number {
  const decimals = CURRENCY_META[currency].decimals;
  const factor = Math.pow(10, decimals);
  return Math.round((amount + Number.EPSILON) * factor) / factor;
}

export function getSmallestUnit(currency: CurrencyCode): number {
  const decimals = CURRENCY_META[currency].decimals;
  return decimals === 0 ? 1 : 0.01;
}

export function getCrossRate(
  from: CurrencyCode,
  to: CurrencyCode,
  rates: ExchangeRates = DEFAULT_EXCHANGE_RATES
): number {
  if (from === to) return 1;
  const fromRate = rates[from] || DEFAULT_EXCHANGE_RATES[from];
  const toRate = rates[to] || DEFAULT_EXCHANGE_RATES[to];
  if (!fromRate || fromRate <= 0 || !toRate || toRate <= 0) return 1;
  return toRate / fromRate;
}

export function convertAmount(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rates: ExchangeRates = DEFAULT_EXCHANGE_RATES
): number {
  if (!Number.isFinite(amount)) return 0;
  if (from === to) return roundToCurrency(amount, to);
  const converted = amount * getCrossRate(from, to, rates);
  return roundToCurrency(converted, to);
}

export function formatCurrency(
  amount: number,
  currency: CurrencyCode,
  options?: { showCode?: boolean; signed?: boolean }
): string {
  const meta = CURRENCY_META[currency];
  const rounded = roundToCurrency(amount, currency);
  const absVal = Math.abs(rounded);

  const formattedNum = absVal.toLocaleString(meta.locale, {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  });

  let prefix = '';
  if (rounded < 0) {
    prefix = '-';
  } else if (options?.signed && rounded > 0) {
    prefix = '+';
  }

  const base = `${prefix}${meta.symbol}${formattedNum}`;
  return options?.showCode ? `${base} ${currency}` : base;
}

export function formatExchangeRate(
  from: CurrencyCode,
  to: CurrencyCode,
  rates: ExchangeRates = DEFAULT_EXCHANGE_RATES
): string {
  const rate = getCrossRate(from, to, rates);
  const precision = rate >= 20 ? 2 : 4;
  return `1 ${from} = ${rate.toFixed(precision)} ${to}`;
}
