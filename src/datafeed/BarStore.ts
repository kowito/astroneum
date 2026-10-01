/**
 * Byte storage for `HistoryCache`: one opaque blob per series key.
 *
 * `OPFSBarStore` persists to the Origin Private File System; `MemoryBarStore`
 * keeps everything in memory (tests, or an explicit per-session cache).
 */

export interface BarStoreEntry {
  key: string
  /** Last write time in ms, used to evict the least recently written series. */
  lastModified: number
}

export interface BarStore {
  read: (key: string) => Promise<Uint8Array | null>
  /** May reject with a `QuotaExceededError` DOMException. */
  write: (key: string, data: Uint8Array<ArrayBuffer>) => Promise<void>
  remove: (key: string) => Promise<void>
  list: () => Promise<BarStoreEntry[]>
}

const OPFS_DIR = 'astroneum-history'
const FILE_SUFFIX = '.bars'

// Keys contain "/" and ":"; OPFS names may not contain "/" or "\".
function fileName (key: string): string {
  return encodeURIComponent(key) + FILE_SUFFIX
}

function keyFromFileName (name: string): string | null {
  if (!name.endsWith(FILE_SUFFIX)) return null
  try {
    return decodeURIComponent(name.slice(0, -FILE_SUFFIX.length))
  } catch {
    return null
  }
}

interface IterableDirectory {
  values: () => AsyncIterable<FileSystemHandle>
}

export class OPFSBarStore implements BarStore {
  private _dir: Promise<FileSystemDirectoryHandle | null> | null = null

  /** True when OPFS can be opened. Writes may still be unsupported (see `isWritable`). */
  static isSupported (): boolean {
    try {
      return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function'
    } catch {
      return false
    }
  }

  /** Main-thread OPFS writes need `createWritable` (missing in Safari before 26). */
  static isWritable (): boolean {
    return typeof FileSystemFileHandle !== 'undefined' &&
      typeof (FileSystemFileHandle.prototype as { createWritable?: unknown }).createWritable === 'function'
  }

  private async _directory (): Promise<FileSystemDirectoryHandle | null> {
    this._dir ??= (async () => {
      if (!OPFSBarStore.isSupported()) return null
      try {
        const root = await navigator.storage.getDirectory()
        return await root.getDirectoryHandle(OPFS_DIR, { create: true })
      } catch {
        // e.g. private browsing modes that reject getDirectory()
        return null
      }
    })()
    return await this._dir
  }

  async read (key: string): Promise<Uint8Array | null> {
    const dir = await this._directory()
    if (dir === null) return null
    try {
      const handle = await dir.getFileHandle(fileName(key))
      const file = await handle.getFile()
      return new Uint8Array(await file.arrayBuffer())
    } catch {
      return null
    }
  }

  async write (key: string, data: Uint8Array<ArrayBuffer>): Promise<void> {
    if (!OPFSBarStore.isWritable()) return
    const dir = await this._directory()
    if (dir === null) return
    const handle = await dir.getFileHandle(fileName(key), { create: true })
    const writable = await handle.createWritable()
    try {
      await writable.write(data)
      await writable.close()
    } catch (e) {
      await writable.abort().catch(() => undefined)
      throw e
    }
  }

  async remove (key: string): Promise<void> {
    const dir = await this._directory()
    if (dir === null) return
    try {
      await dir.removeEntry(fileName(key))
    } catch {
      // already gone
    }
  }

  async list (): Promise<BarStoreEntry[]> {
    const dir = await this._directory()
    if (dir === null) return []
    const entries: BarStoreEntry[] = []
    try {
      for await (const handle of (dir as unknown as IterableDirectory).values()) {
        if (handle.kind !== 'file') continue
        const key = keyFromFileName(handle.name)
        if (key === null) continue
        const file = await (handle as FileSystemFileHandle).getFile()
        entries.push({ key, lastModified: file.lastModified })
      }
    } catch {
      // directory iteration unsupported or interrupted — return what we have
    }
    return entries
  }
}

export interface MemoryBarStoreOptions {
  /** Simulated quota in bytes; writes beyond it reject with `QuotaExceededError`. */
  quotaBytes?: number
}

export class MemoryBarStore implements BarStore {
  private readonly _entries = new Map<string, { data: Uint8Array, lastModified: number }>()
  private readonly _quotaBytes: number
  private _clock = 0

  constructor (options: MemoryBarStoreOptions = {}) {
    this._quotaBytes = options.quotaBytes ?? Infinity
  }

  async read (key: string): Promise<Uint8Array | null> {
    return await Promise.resolve(this._entries.get(key)?.data.slice() ?? null)
  }

  async write (key: string, data: Uint8Array<ArrayBuffer>): Promise<void> {
    let used = data.byteLength
    this._entries.forEach((entry, k) => { if (k !== key) used += entry.data.byteLength })
    if (used > this._quotaBytes) {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    }
    // A monotonic clock keeps eviction order deterministic within one millisecond.
    this._entries.set(key, { data: data.slice(), lastModified: ++this._clock })
    await Promise.resolve()
  }

  async remove (key: string): Promise<void> {
    this._entries.delete(key)
    await Promise.resolve()
  }

  async list (): Promise<BarStoreEntry[]> {
    return await Promise.resolve(
      [...this._entries].map(([key, entry]) => ({ key, lastModified: entry.lastModified }))
    )
  }
}

/**
 * Delete cached history. With a namespace, only that namespace's series are
 * removed; without one, everything Astroneum cached on this origin.
 */
export async function clearHistoryCache (namespace?: string): Promise<void> {
  if (!OPFSBarStore.isSupported()) return
  const store = new OPFSBarStore()
  const prefix = namespace === undefined ? '' : `${namespace}/`
  const entries = await store.list()
  await Promise.all(
    entries.filter(entry => entry.key.startsWith(prefix)).map(async entry => { await store.remove(entry.key) })
  )
}
