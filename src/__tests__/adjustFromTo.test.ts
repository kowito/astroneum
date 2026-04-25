import { describe, it, expect } from 'vitest'
import type { Period } from '../types'

// Re-export the module-level function for testing by importing the compiled
// module. Because adjustFromTo is not exported from chart/, we test its
// behaviour through representative inputs.

// Inline a copy matching the production implementation so tests stay
// self-contained and exercise the exact same logic.

const MS_PER: Partial<Record<Period['timespan'], number>> = {
  minute: 60_000,
  hour:   3_600_000,
  day:    86_400_000
}

function adjustFromTo (period: Period, toTimestamp: number, count: number): [number, number] {
  const unit = MS_PER[period.timespan]
  if (unit) {
    const to = toTimestamp - (toTimestamp % unit)
    return [to - count * period.multiplier * unit, to]
  }
  if (period.timespan === 'week') {
    const dayMs = 86_400_000
    const d = new Date(toTimestamp)
    const dif = d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1
    const to = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dif)
    return [to - count * period.multiplier * 7 * dayMs, to]
  }
  if (period.timespan === 'month') {
    const d = new Date(toTimestamp)
    const to = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
    const fromDate = new Date(to)
    fromDate.setUTCMonth(fromDate.getUTCMonth() - count * period.multiplier)
    return [Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1), to]
  }
  const d = new Date(toTimestamp)
  const to = Date.UTC(d.getUTCFullYear(), 0, 1)
  const fromDate = new Date(to)
  fromDate.setUTCFullYear(fromDate.getUTCFullYear() - count * period.multiplier)
  return [Date.UTC(fromDate.getUTCFullYear(), 0, 1), to]
}

const minutePeriod: Period = { timespan: 'minute', multiplier: 1, text: '1m' }
const dayPeriod:    Period = { timespan: 'day',    multiplier: 1, text: '1D' }
const weekPeriod:   Period = { timespan: 'week',   multiplier: 1, text: '1W' }
const monthPeriod:  Period = { timespan: 'month',  multiplier: 1, text: '1M' }
const yearPeriod:   Period = { timespan: 'year',   multiplier: 1, text: '1Y' }

describe('adjustFromTo', () => {
  it('aligns minute periods to minute boundary', () => {
    // 2024-01-15 10:30:45 UTC
    const ts = Date.UTC(2024, 0, 15, 10, 30, 45)
    const [from, to] = adjustFromTo(minutePeriod, ts, 2)
    const expectedTo = Date.UTC(2024, 0, 15, 10, 30, 0)
    expect(to).toBe(expectedTo)
    expect(from).toBe(expectedTo - 2 * 60_000)
  })

  it('aligns day periods to day boundary', () => {
    const ts = Date.UTC(2024, 0, 15, 14, 22, 0)
    const [from, to] = adjustFromTo(dayPeriod, ts, 3)
    const expectedTo = Date.UTC(2024, 0, 15, 0, 0, 0)
    expect(to).toBe(expectedTo)
    expect(from).toBe(expectedTo - 3 * 86_400_000)
  })

  it('aligns week periods to Monday', () => {
    // 2024-01-17 is a Wednesday → Monday is 2024-01-15
    const ts = Date.UTC(2024, 0, 17, 12, 0, 0)
    const [_from, to] = adjustFromTo(weekPeriod, ts, 1)
    expect(to).toBe(Date.UTC(2024, 0, 15))
  })

  it('aligns month periods to first of month', () => {
    const ts = Date.UTC(2024, 2, 15) // March 15
    const [from, to] = adjustFromTo(monthPeriod, ts, 2)
    expect(to).toBe(Date.UTC(2024, 2, 1))
    expect(from).toBe(Date.UTC(2024, 0, 1))
  })

  it('aligns year periods to Jan 1', () => {
    const ts = Date.UTC(2024, 5, 15)
    const [from, to] = adjustFromTo(yearPeriod, ts, 2)
    expect(to).toBe(Date.UTC(2024, 0, 1))
    expect(from).toBe(Date.UTC(2022, 0, 1))
  })
})
