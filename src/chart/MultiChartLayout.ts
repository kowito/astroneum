import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'

import AstroneumChart from './AstroneumChart'

import type { AstroneumOptions, AstroneumHandle, SymbolInfo, Period } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Number of charts in a multi-chart view. */
export type MultiChartCount = 2 | 4 | 8 | 16

/** A slot configuration within the layout. */
export interface MultiChartSlot {
  symbol: SymbolInfo
  period: Period
}

/** Options for creating a MultiChartLayout. */
export interface MultiChartLayoutOptions extends Omit<AstroneumOptions, 'symbol' | 'period'> {
  /** The DOM element (or id) to render the layout into. */
  container: string | HTMLElement
  /**
   * Number of charts to display. Determines the grid.
   * 2  → 1×2 (two columns)
   * 4  → 2×2
   * 8  → 2×4
   * 16 → 4×4
   */
  count?: MultiChartCount
  /** Initial slot configuration. Defaults to the first symbol/period for all slots. */
  slots?: MultiChartSlot[]
  /** Symbol / period used for slots with no explicit configuration. */
  symbol: SymbolInfo
  period: Period
  /** Whether to sync crosshair across all charts (default: true). */
  syncCrosshair?: boolean
  /** Whether to sync symbol and period across all charts (default: false). */
  syncSymbolPeriod?: boolean
  /** localStorage key for layout persistence. Pass null to disable. */
  storageKey?: string | null
}

/** A single chart entry inside the layout. */
interface ChartEntry {
  container: HTMLDivElement
  instance: AstroneumHandle
  root: Root
}

// ---------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------

interface GridDef { cols: number; rows: number }

function getGrid (count: MultiChartCount): GridDef {
  switch (count) {
    case 2:  return { cols: 2, rows: 1 }
    case 4:  return { cols: 2, rows: 2 }
    case 8:  return { cols: 4, rows: 2 }
    case 16: return { cols: 4, rows: 4 }
    default: return { cols: 2, rows: 1 }
  }
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

interface PersistedLayout {
  count: MultiChartCount
  slots: MultiChartSlot[]
}

function saveLayout (key: string, data: PersistedLayout): void {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch {
    // ignore quota errors
  }
}

function loadLayout (key: string): PersistedLayout | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as PersistedLayout) : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// MultiChartLayout
// ---------------------------------------------------------------------------

/**
 * Manages a grid of Astroneum chart instances inside a single container.
 *
 * @example
 * ```ts
 * const layout = new MultiChartLayout({
 *   container: 'chart-root',
 *   count: 4,
 *   symbol: { ticker: 'AAPL' },
 *   period: { multiplier: 1, timespan: 'day', text: 'D' },
 *   datafeed: myDatafeed,
 *   storageKey: 'my-layout'
 * })
 * ```
 */
export default class MultiChartLayout {
  private _container: HTMLElement
  private _count: MultiChartCount
  private _charts: ChartEntry[] = []
  private _slots: MultiChartSlot[]
  private _options: MultiChartLayoutOptions
  private _storageKey: string | null
  private _syncCrosshair: boolean
  private _syncSymbolPeriod: boolean
  private _activeIndex = 0
  private _wrapperEl: HTMLDivElement | null = null

  constructor (options: MultiChartLayoutOptions) {
    this._options = options
    this._count = options.count ?? 2
    this._storageKey = options.storageKey !== undefined ? options.storageKey : 'astroneum-multi-layout'
    this._syncCrosshair = options.syncCrosshair ?? true
    this._syncSymbolPeriod = options.syncSymbolPeriod ?? false

    // Resolve container
    if (typeof options.container === 'string') {
      const el = document.getElementById(options.container)
      if (!el) throw new Error(`MultiChartLayout: container #${options.container} not found`)
      this._container = el
    } else {
      this._container = options.container
    }

    // Load persisted layout if available
    let persisted: PersistedLayout | null = null
    if (this._storageKey) {
      persisted = loadLayout(this._storageKey)
    }

    this._count = persisted?.count ?? this._count

    // Build default slots
    const defaultSlot: MultiChartSlot = { symbol: options.symbol, period: options.period }
    const explicitSlots = options.slots ?? []
    this._slots = Array.from({ length: this._count }, (_, i) =>
      persisted?.slots[i] ?? explicitSlots[i] ?? defaultSlot
    )

    this._render()
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private _render (): void {
    // Clean up any existing charts
    this._destroy()

    const { cols, rows } = getGrid(this._count)

    // Create wrapper
    const wrapper = document.createElement('div')
    wrapper.className = 'astroneum-multi-layout'
    Object.assign(wrapper.style, {
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
      width: '100%',
      height: '100%',
      gap: '2px',
      boxSizing: 'border-box'
    })
    this._wrapperEl = wrapper

    for (let i = 0; i < this._count; i++) {
      const slot = this._slots[i]
      const cellEl = document.createElement('div')
      cellEl.className = 'astroneum-multi-cell'
      Object.assign(cellEl.style, {
        position: 'relative',
        overflow: 'hidden',
        minWidth: '0',
        minHeight: '0'
      })

      // Active border
      if (i === this._activeIndex) {
        cellEl.style.outline = '2px solid #1677ff'
      }

      // Click to set active
      cellEl.addEventListener('click', () => this._setActive(i), { capture: true })

      wrapper.appendChild(cellEl)

      // Build per-chart options (omit symbol/period from template)
      const slotOptions: AstroneumOptions = {
        ...this._options,
        symbol: slot.symbol,
        period: slot.period,
        drawingBarVisible: false // in multi-layout, drawing bar takes too much space
      }

      let chartHandle: AstroneumHandle | null = null
      const root = createRoot(cellEl)
      flushSync(() => {
        root.render(
          React.createElement(AstroneumChart, {
            ...slotOptions,
            ref: (chart: AstroneumHandle | null) => { if (chart) chartHandle = chart }
          })
        )
      })
      if (!chartHandle) throw new Error('MultiChartLayout: chart initialization failed')
      this._charts.push({ container: cellEl, instance: chartHandle, root })
    }

    this._container.innerHTML = ''
    this._container.appendChild(wrapper)
  }

  private _setActive (index: number): void {
    const prev = this._charts[this._activeIndex]
    if (prev) {
      prev.container.style.outline = ''
    }
    this._activeIndex = index
    const next = this._charts[index]
    if (next) {
      next.container.style.outline = '2px solid #1677ff'
    }
  }

  private _destroy (): void {
    for (const { root } of this._charts) {
      root.unmount()
    }
    this._charts = []
    if (this._wrapperEl) {
      this._container.removeChild(this._wrapperEl)
      this._wrapperEl = null
    }
  }

  private _persist (): void {
    if (!this._storageKey) return
    saveLayout(this._storageKey, { count: this._count, slots: this._slots })
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Change the layout grid (2 | 4 | 8 | 16). Re-renders all charts. */
  setCount (count: MultiChartCount): void {
    this._count = count
    // Resize slots array
    const defaultSlot: MultiChartSlot = { symbol: this._options.symbol, period: this._options.period }
    while (this._slots.length < count) {
      this._slots.push(defaultSlot)
    }
    this._slots = this._slots.slice(0, count)
    this._activeIndex = Math.min(this._activeIndex, count - 1)
    this._render()
    this._persist()
  }

  /** Get the count of charts. */
  getCount (): MultiChartCount {
    return this._count
  }

  /** Get the chart instance at a given index. */
  getChart (index: number): AstroneumHandle | undefined {
    return this._charts[index]?.instance
  }

  /** Get all chart instances. */
  getAllCharts (): AstroneumHandle[] {
    return this._charts.map(c => c.instance)
  }

  /** Get the index of the currently active (focused) chart. */
  getActiveIndex (): number {
    return this._activeIndex
  }

  /** Get the currently active chart instance. */
  getActiveChart (): AstroneumHandle | undefined {
    return this._charts[this._activeIndex]?.instance
  }

  /**
   * Set the symbol for a specific chart slot (or all slots if syncSymbolPeriod is on).
   */
  setSymbol (symbol: SymbolInfo, index?: number): void {
    const targets = this._syncSymbolPeriod
      ? this._charts.map((_, i) => i)
      : [index ?? this._activeIndex]

    for (const i of targets) {
      const chart = this._charts[i]
      if (chart) {
        chart.instance.setSymbol(symbol)
        this._slots[i] = { ...this._slots[i], symbol }
      }
    }
    this._persist()
  }

  /**
   * Set the period for a specific chart slot (or all slots if syncSymbolPeriod is on).
   */
  setPeriod (period: Period, index?: number): void {
    const targets = this._syncSymbolPeriod
      ? this._charts.map((_, i) => i)
      : [index ?? this._activeIndex]

    for (const i of targets) {
      const chart = this._charts[i]
      if (chart) {
        chart.instance.setPeriod(period)
        this._slots[i] = { ...this._slots[i], period }
      }
    }
    this._persist()
  }

  /** Set theme for all charts. */
  setTheme (theme: string): void {
    for (const { instance } of this._charts) {
      instance.setTheme(theme)
    }
  }

  /** Set locale for all charts. */
  setLocale (locale: string): void {
    for (const { instance } of this._charts) {
      instance.setLocale(locale)
    }
  }

  /** Save current layout to localStorage immediately. */
  saveLayout (): void {
    this._persist()
  }

  /** Destroy all charts and clean up the DOM. */
  destroy (): void {
    this._destroy()
  }
}
