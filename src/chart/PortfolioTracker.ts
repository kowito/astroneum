/**
 * PortfolioTracker — client-side position / P&L tracker.
 * Persists to localStorage under key 'astroneum-portfolio'.
 */

const STORAGE_KEY = 'astroneum-portfolio'

export type PositionSide = 'long' | 'short'

export interface Position {
  id: string
  symbol: string
  side: PositionSide
  quantity: number
  entryPrice: number
  entryTime: string   // ISO string
  exitPrice?: number
  exitTime?: string   // ISO string
  note?: string
}

export interface PnLResult {
  position: Position
  /** Unrealised (open) or realised (closed) gross P&L in price units × quantity */
  pnl: number
  /** P&L as a fraction of entry value, e.g. 0.05 = +5 % */
  pnlPercent: number
}

export type PortfolioChangedCallback = (positions: Position[]) => void

function uuid (): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export class PortfolioTracker {
  private static _instance: PortfolioTracker
  private _positions: Position[] = []
  private _listeners: Set<PortfolioChangedCallback> = new Set()

  private constructor () { this._load() }

  static getInstance (): PortfolioTracker {
    if (!PortfolioTracker._instance) PortfolioTracker._instance = new PortfolioTracker()
    return PortfolioTracker._instance
  }

  // ─── Subscriptions ────────────────────────────────────────────────────────

  onChange (cb: PortfolioChangedCallback): () => void {
    this._listeners.add(cb)
    return () => { this._listeners.delete(cb) }
  }

  // ─── Positions ────────────────────────────────────────────────────────────

  addPosition (params: Omit<Position, 'id' | 'entryTime'> & { entryTime?: string }): Position {
    const pos: Position = {
      ...params,
      id: uuid(),
      entryTime: params.entryTime ?? new Date().toISOString()
    }
    this._positions.push(pos)
    this._persist()
    return pos
  }

  closePosition (id: string, exitPrice: number, exitTime?: string): void {
    const pos = this._positions.find(p => p.id === id)
    if (!pos) return
    pos.exitPrice = exitPrice
    pos.exitTime = exitTime ?? new Date().toISOString()
    this._persist()
  }

  deletePosition (id: string): void {
    this._positions = this._positions.filter(p => p.id !== id)
    this._persist()
  }

  getOpenPositions (symbol?: string): Position[] {
    return this._positions.filter(p =>
      p.exitPrice === undefined && (symbol == null || p.symbol === symbol)
    )
  }

  getClosedPositions (symbol?: string): Position[] {
    return this._positions.filter(p =>
      p.exitPrice !== undefined && (symbol == null || p.symbol === symbol)
    )
  }

  getAllPositions (): Position[] { return [...this._positions] }

  // ─── P&L ──────────────────────────────────────────────────────────────────

  /**
   * Calculate P&L for a single position.
   * @param id - Position id
   * @param currentPrice - Current market price (used for open positions)
   */
  getPnL (id: string, currentPrice?: number): PnLResult | null {
    const pos = this._positions.find(p => p.id === id)
    if (!pos) return null
    const exitPrice = pos.exitPrice ?? currentPrice
    if (exitPrice == null) return null
    const rawPnl = (exitPrice - pos.entryPrice) * pos.quantity * (pos.side === 'long' ? 1 : -1)
    const entryValue = pos.entryPrice * pos.quantity
    return {
      position: pos,
      pnl: rawPnl,
      pnlPercent: entryValue === 0 ? 0 : rawPnl / entryValue
    }
  }

  /**
   * Calculate total P&L across all positions (open or closed).
   * @param currentPrices - Map of symbol → current price for open positions
   */
  getTotalPnL (currentPrices?: Record<string, number>): number {
    let total = 0
    for (const pos of this._positions) {
      const exitPrice = pos.exitPrice ?? currentPrices?.[pos.symbol]
      if (exitPrice == null) continue
      total += (exitPrice - pos.entryPrice) * pos.quantity * (pos.side === 'long' ? 1 : -1)
    }
    return total
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private _persist (): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._positions))
    } catch { /* quota exceeded */ }
    this._listeners.forEach(cb => { cb([...this._positions]) })
  }

  private _load (): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed: Position[] = JSON.parse(raw)
        if (Array.isArray(parsed)) this._positions = parsed
      }
    } catch { /* corrupt data */ }
  }
}

export default PortfolioTracker
