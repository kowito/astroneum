/**
 * OPFSCache — P4-C: Origin Private File System cache for historical bar data.
 *
 * Uses the OPFS (navigator.storage.getDirectory) API to persist historical
 * OHLCV data between sessions.  A cache hit eliminates the need for a network
 * request for previously fetched date ranges.
 *
 * Storage layout
 * ─────────────
 * Each cache entry is a binary file at:
 *   <OPFS root>/astroneum/<ticker>/<timespan>/<multiplier>/<from>_<to>.bars
 *
 * File contents are encoded with `BarsCodec` (see codec/BarsCodec.ts).
 *
 * Cache invalidation
 * ──────────────────
 * Entries never expire automatically — callers should call `invalidate()` when
 * the symbol's data changes (e.g., after a corporate action or data correction).
 *
 * Graceful degradation
 * ────────────────────
 * All methods are no-ops (return `null` / `false`) when OPFS is unavailable.
 * Use `OPFSCache.isSupported()` to check.
 */

import type { CandleData } from '@/types'
import { BarsCodec } from './codec/BarsCodec'

const OPFS_ROOT = 'astroneum'

export class OPFSCache {
  private _root: FileSystemDirectoryHandle | null = null
  private _ready = false

  static isSupported (): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof (navigator.storage as { getDirectory?: unknown }).getDirectory === 'function'
    )
  }

  /**
   * Initialise the OPFS root directory.  Must be called once before any
   * other method.  Safe to call multiple times (idempotent).
   */
  async init (): Promise<void> {
    if (this._ready) return
    if (!OPFSCache.isSupported()) return
    try {
      const root = await navigator.storage.getDirectory()
      this._root = await root.getDirectoryHandle(OPFS_ROOT, { create: true })
      this._ready = true
    } catch {
      // OPFS unavailable (e.g., private browsing on Safari) — silently degrade
    }
  }

  /**
   * Read cached bars for the given key.
   * @returns Decoded bars, or `null` on cache miss / unavailable.
   */
  async get (
    ticker: string,
    timespan: string,
    multiplier: number,
    from: number,
    to: number
  ): Promise<CandleData[] | null> {
    const fh = await this._fileHandle(ticker, timespan, multiplier, from, to, false)
    if (fh === null) return null
    try {
      const file = await fh.getFile()
      const buf  = await file.arrayBuffer()
      const bars = BarsCodec.decode(new Uint8Array(buf))
      return bars.length > 0 ? bars : null
    } catch {
      return null
    }
  }

  /**
   * Write bars into the cache.
   */
  async set (
    ticker: string,
    timespan: string,
    multiplier: number,
    from: number,
    to: number,
    bars: CandleData[]
  ): Promise<void> {
    if (!this._ready || bars.length === 0) return
    const fh = await this._fileHandle(ticker, timespan, multiplier, from, to, true)
    if (fh === null) return
    try {
      const writable = await fh.createWritable()
      // Cast to ArrayBuffer to satisfy FileSystemWriteChunkType — BarsCodec.encode
      // returns Uint8Array<ArrayBuffer> which is always backed by a plain ArrayBuffer.
      await writable.write(BarsCodec.encode(bars).buffer as ArrayBuffer)
      await writable.close()
    } catch {
      // Write failure is non-fatal
    }
  }

  /**
   * Remove a specific cache entry.
   */
  async invalidate (
    ticker: string,
    timespan: string,
    multiplier: number,
    from: number,
    to: number
  ): Promise<void> {
    if (!this._ready || this._root === null) return
    try {
      const dir = await this._getDir(ticker, timespan, multiplier, false)
      if (dir === null) return
      await dir.removeEntry(`${from}_${to}.bars`)
    } catch {
      /* ignore — entry may not exist */
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async _fileHandle (
    ticker: string,
    timespan: string,
    multiplier: number,
    from: number,
    to: number,
    create: boolean
  ): Promise<FileSystemFileHandle | null> {
    if (!this._ready) return null
    try {
      const dir = await this._getDir(ticker, timespan, multiplier, create)
      if (dir === null) return null
      return await dir.getFileHandle(`${from}_${to}.bars`, { create })
    } catch {
      return null
    }
  }

  private async _getDir (
    ticker: string,
    timespan: string,
    multiplier: number,
    create: boolean
  ): Promise<FileSystemDirectoryHandle | null> {
    if (this._root === null) return null
    try {
      const tickerDir = await this._root.getDirectoryHandle(ticker, { create })
      const tsDir     = await tickerDir.getDirectoryHandle(timespan, { create })
      return await tsDir.getDirectoryHandle(String(multiplier), { create })
    } catch {
      return null
    }
  }
}

// Module-level singleton so callers can share one cache instance.
export const opfsCache = new OPFSCache()
