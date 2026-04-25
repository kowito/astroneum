/**
 * WatchlistManager — client-side multi-watchlist manager.
 * Persists to localStorage under key 'astroneum-watchlists'.
 */

import type { Price } from '@/types'

const STORAGE_KEY = 'astroneum-watchlists'

export interface WatchSymbol {
  ticker: string
  name?: string
  /** Injected externally — not stored. Branded Price ensures callers use asPrice() at ingress. */
  lastPrice?: Price
  changePercent?: number
}

export interface Watchlist {
  id: string
  name: string
  symbols: WatchSymbol[]
}

export type WatchlistsChangedCallback = (lists: Watchlist[]) => void

function uuid (): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export class WatchlistManager {
  private static _instance: WatchlistManager
  private _lists: Watchlist[] = []
  private _listeners: Set<WatchlistsChangedCallback> = new Set()

  private constructor () { this._load() }

  static getInstance (): WatchlistManager {
    if (!WatchlistManager._instance) WatchlistManager._instance = new WatchlistManager()
    return WatchlistManager._instance
  }

  // ─── Subscriptions ────────────────────────────────────────────────────────

  onChange (cb: WatchlistsChangedCallback): () => void {
    this._listeners.add(cb)
    return () => { this._listeners.delete(cb) }
  }

  // ─── List management ──────────────────────────────────────────────────────

  getLists (): Watchlist[] { return this._lists }

  createList (name: string): Watchlist {
    const list: Watchlist = { id: uuid(), name: name.trim() || 'Watchlist', symbols: [] }
    this._lists.push(list)
    this._persist()
    return list
  }

  deleteList (id: string): void {
    this._lists = this._lists.filter(l => l.id !== id)
    this._persist()
  }

  renameList (id: string, name: string): void {
    const list = this._find(id)
    if (!list) return
    list.name = name.trim() || list.name
    this._persist()
  }

  reorderLists (from: number, to: number): void {
    if (from === to) return
    const [item] = this._lists.splice(from, 1)
    this._lists.splice(to, 0, item)
    this._persist()
  }

  // ─── Symbol management ────────────────────────────────────────────────────

  getSymbols (listId: string): WatchSymbol[] { return this._find(listId)?.symbols ?? [] }

  addSymbol (listId: string, symbol: WatchSymbol): void {
    const list = this._find(listId)
    if (!list) return
    if (list.symbols.some(s => s.ticker === symbol.ticker)) return
    list.symbols.push({ ticker: symbol.ticker, name: symbol.name })
    this._persist()
  }

  removeSymbol (listId: string, ticker: string): void {
    const list = this._find(listId)
    if (!list) return
    list.symbols = list.symbols.filter(s => s.ticker !== ticker)
    this._persist()
  }

  reorderSymbols (listId: string, from: number, to: number): void {
    const list = this._find(listId)
    if (!list || from === to) return
    const [item] = list.symbols.splice(from, 1)
    list.symbols.splice(to, 0, item)
    this._persist()
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private _find (id: string): Watchlist | undefined { return this._lists.find(l => l.id === id) }

  private _persist (): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._lists))
    } catch { /* quota exceeded — ignore */ }
    this._listeners.forEach(cb => { cb([...this._lists]) })
  }

  private _load (): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed: Watchlist[] = JSON.parse(raw)
        if (Array.isArray(parsed)) this._lists = parsed
      }
    } catch { /* corrupt data — start fresh */ }

    // Always ensure at least one default list
    if (this._lists.length === 0) {
      this._lists.push({ id: uuid(), name: 'Watchlist', symbols: [] })
    }
  }
}

export default WatchlistManager
