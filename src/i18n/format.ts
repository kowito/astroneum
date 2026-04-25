/**
 * Locale-aware number and date formatting utilities.
 * Uses the native Intl API — no extra dependencies.
 */

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

export interface FormatPriceOptions {
  /** Number of decimal places. Defaults to 2. */
  precision?: number
  /** Whether to show compact notation (1.2K, 3.4M). Defaults to false. */
  compact?: boolean
  /** Currency code, e.g. "USD". When provided, formats as currency. */
  currency?: string
}

/**
 * Format a price / numeric value for display.
 *
 * @example
 * formatPrice(1234567.891, 'en-US', { precision: 2 }) // "1,234,567.89"
 * formatPrice(1234567.891, 'de-DE', { precision: 2 }) // "1.234.567,89"
 * formatPrice(1234567, 'en-US', { compact: true })     // "1.2M"
 * formatPrice(1234.5, 'en-US', { currency: 'USD' })    // "$1,234.50"
 */
export function formatPrice (value: number, locale: string, options: FormatPriceOptions = {}): string {
  const { precision = 2, compact = false, currency } = options

  if (!isFinite(value)) return String(value)

  if (currency) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: precision,
      maximumFractionDigits: precision
    }).format(value)
  }

  if (compact) {
    return new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(value)
  }

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  }).format(value)
}

/**
 * Format a volume number compactly.
 *
 * @example
 * formatVolume(1234567, 'en-US') // "1.2M"
 * formatVolume(54321,   'zh-CN') // "5.4万"
 */
export function formatVolume (value: number, locale: string): string {
  if (!isFinite(value)) return String(value)
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 2
  }).format(value)
}

/**
 * Format a percentage value.
 *
 * @example
 * formatPercent(0.0523, 'en-US') // "5.23%"
 * formatPercent(-0.012, 'fr-FR') // "-1,20 %"
 */
export function formatPercent (value: number, locale: string, precision = 2): string {
  if (!isFinite(value)) return String(value)
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  }).format(value)
}

// ---------------------------------------------------------------------------
// Date / time formatting
// ---------------------------------------------------------------------------

export type DateFormatStyle = 'short' | 'medium' | 'long' | 'full'
export type TimeFormatStyle = 'short' | 'medium'

/**
 * Format a UNIX timestamp (ms or s) as a locale-aware date string.
 *
 * @param timestamp  UNIX timestamp in milliseconds (or seconds — auto-detected)
 * @param locale     BCP-47 locale string, e.g. "en-US"
 * @param style      Intl DateTimeFormat date style
 */
export function formatDate (timestamp: number, locale: string, style: DateFormatStyle = 'medium'): string {
  const ms = timestamp > 1e10 ? timestamp : timestamp * 1000
  return new Intl.DateTimeFormat(locale, { dateStyle: style }).format(new Date(ms))
}

/**
 * Format a UNIX timestamp as a locale-aware time string.
 */
export function formatTime (timestamp: number, locale: string, style: TimeFormatStyle = 'short'): string {
  const ms = timestamp > 1e10 ? timestamp : timestamp * 1000
  return new Intl.DateTimeFormat(locale, { timeStyle: style }).format(new Date(ms))
}

/**
 * Format a UNIX timestamp as a combined date+time string.
 */
export function formatDateTime (
  timestamp: number,
  locale: string,
  dateStyle: DateFormatStyle = 'medium',
  timeStyle: TimeFormatStyle = 'short'
): string {
  const ms = timestamp > 1e10 ? timestamp : timestamp * 1000
  return new Intl.DateTimeFormat(locale, { dateStyle, timeStyle }).format(new Date(ms))
}

/**
 * Format a duration in milliseconds as a human-readable string.
 * Uses RelativeTimeFormat for relative phrases when |ms| < threshold.
 *
 * @example
 * formatDuration(60_000,    'en-US') // "1 minute"
 * formatDuration(3_600_000, 'de-DE') // "1 Stunde"
 */
export function formatDuration (ms: number, locale: string): string {
  const abs = Math.abs(ms)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'long' })

  if (abs < 60_000)     return rtf.format(Math.round(ms / 1_000), 'second')
  if (abs < 3_600_000)  return rtf.format(Math.round(ms / 60_000), 'minute')
  if (abs < 86_400_000) return rtf.format(Math.round(ms / 3_600_000), 'hour')
  if (abs < 2_592_000_000) return rtf.format(Math.round(ms / 86_400_000), 'day')
  return rtf.format(Math.round(ms / 2_592_000_000), 'month')
}

// ---------------------------------------------------------------------------
// Period/timeframe label formatting
// ---------------------------------------------------------------------------

const TIMESPAN_LABELS: Record<string, Record<string, string>> = {
  'en-US': { second: 's', minute: 'm', hour: 'h', day: 'D', week: 'W', month: 'M', year: 'Y' },
  'zh-CN': { second: '秒', minute: '分', hour: '时', day: '日', week: '周', month: '月', year: '年' },
  'ja-JP': { second: '秒', minute: '分', hour: '時', day: '日', week: '週', month: '月', year: '年' },
  'ko-KR': { second: '초', minute: '분', hour: '시', day: '일', week: '주', month: '월', year: '년' },
  'de-DE': { second: 'S', minute: 'M', hour: 'Std', day: 'T', week: 'W', month: 'Mo', year: 'J' },
  'fr-FR': { second: 's', minute: 'm', hour: 'h', day: 'J', week: 'S', month: 'M', year: 'A' },
  'es-ES': { second: 's', minute: 'm', hour: 'h', day: 'D', week: 'S', month: 'M', year: 'A' },
  'ar-SA': { second: 'ث', minute: 'د', hour: 'س', day: 'ي', week: 'أ', month: 'ش', year: 'س' },
}

/**
 * Format a Period as a short locale-aware timeframe label.
 *
 * @example
 * formatPeriod({ multiplier: 1, timespan: 'minute' }, 'en-US')  // "1m"
 * formatPeriod({ multiplier: 4, timespan: 'hour' },   'zh-CN')  // "4时"
 * formatPeriod({ multiplier: 1, timespan: 'day' },    'en-US')  // "1D"
 */
export function formatPeriod (
  period: { multiplier: number; timespan: string },
  locale: string
): string {
  const labels = TIMESPAN_LABELS[locale] ?? TIMESPAN_LABELS['en-US']
  const suffix = labels[period.timespan] ?? period.timespan
  return `${period.multiplier}${suffix}`
}

// ---------------------------------------------------------------------------
// Smart price precision
// ---------------------------------------------------------------------------

/**
 * Detect an appropriate number of decimal places for a given price.
 * Useful when `pricePrecision` is not specified on a SymbolInfo.
 *
 * @example
 * detectPricePrecision(0.00001234) // 8
 * detectPricePrecision(1234.56)    // 2
 * detectPricePrecision(50000)      // 0
 */
export function detectPricePrecision (price: number): number {
  if (!isFinite(price) || price === 0) return 2
  const abs = Math.abs(price)
  if (abs >= 1000)  return 0
  if (abs >= 1)     return 2
  if (abs >= 0.01)  return 4
  if (abs >= 0.0001) return 6
  return 8
}
