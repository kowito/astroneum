'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { clearHistoryCache } from 'astroneum'

import { MOCK_SYMBOLS, createMockDatafeed, type MockEvent } from '../../../docs/mockMarket'
import LiveChart from './LiveChart'

const NAMESPACE = 'docs-cache-demo'
const STORAGE_KEY = 'astroneum-docs-last-load'
const BAR_BYTES = 56
const HEADER_BYTES = 16

interface LoadInfo {
  bars: number
  from: number
  to: number
}

interface Saved {
  key: string
  bytes: number
}

const hhmm = (time: number): string => new Date(time).toISOString().slice(11, 16)

async function listSaved(): Promise<Saved[]> {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.getDirectory !== 'function') return []
  try {
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle('astroneum-history')
    const found: Saved[] = []
    for await (const [name, handle] of (dir as unknown as { entries: () => AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (handle.kind !== 'file') continue
      const key = decodeURIComponent(name.replace(/\.bars$/, ''))
      if (!key.startsWith(`${NAMESPACE}/`)) continue
      found.push({ key, bytes: (await (handle as FileSystemFileHandle).getFile()).size })
    }
    return found
  } catch {
    return []
  }
}

function readPrevious(): LoadInfo | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw === null ? null : JSON.parse(raw) as LoadInfo
  } catch {
    return null
  }
}

/** Shows what the history cache saves in this browser, and how much less each reload fetches. */
export default function CacheInspector() {
  const [current, setCurrent] = useState<LoadInfo | null>(null)
  const [previous, setPrevious] = useState<LoadInfo | null>(null)
  const [saved, setSaved] = useState<Saved[]>([])
  const [supported, setSupported] = useState(true)

  const refresh = useCallback(async () => { setSaved(await listSaved()) }, [])

  useEffect(() => {
    setPrevious(readPrevious())
    setSupported(typeof navigator.storage?.getDirectory === 'function')
    void refresh()
  }, [refresh])

  const onEvent = useCallback((event: MockEvent) => {
    // Only the first history request of this page load is the initial load.
    if (event.kind !== 'history') return
    setCurrent(existing => {
      if (existing !== null) return existing
      const info = { bars: event.bars, from: event.from, to: event.to }
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(info)) } catch { /* private mode */ }
      return info
    })
    window.setTimeout(() => { void refresh() }, 1500)
  }, [refresh])

  const datafeed = useMemo(() => createMockDatafeed({ onEvent }), [onEvent])
  const cache = useMemo(() => ({ namespace: NAMESPACE }), [])

  const clear = async (): Promise<void> => {
    await clearHistoryCache(NAMESPACE)
    try { window.localStorage.removeItem(STORAGE_KEY) } catch { /* private mode */ }
    setPrevious(null)
    await refresh()
  }

  return (
    <div className="dc-playground">
      <div className="ci-stage">
        <LiveChart eager datafeed={datafeed} symbol={MOCK_SYMBOLS[0]} historyCache={cache} height={420} />
        <div className="ci-panel">
          <h3>How much did this load ask for?</h3>
          <dl className="ci-loads">
            <div>
              <dt>This load</dt>
              <dd>{current === null ? 'waiting…' : <><b>{current.bars}</b> bars <small>{hhmm(current.from)} to {hhmm(current.to)}</small></>}</dd>
            </div>
            <div>
              <dt>The load before</dt>
              <dd>{previous === null ? 'none yet: reload the page' : <><b>{previous.bars}</b> bars <small>{hhmm(previous.from)} to {hhmm(previous.to)}</small></>}</dd>
            </div>
          </dl>
          <h3>Saved in this browser</h3>
          {!supported && <p className="ci-note">This browser cannot store files for the cache (the Origin Private File System is unavailable). The chart works without it.</p>}
          {supported && saved.length === 0 && <p className="ci-note">Nothing saved yet. It appears a moment after the chart loads.</p>}
          <ul className="ci-saved">
            {saved.map(file => (
              <li key={file.key}>
                <code>{file.key.replace(`${NAMESPACE}/`, '')}</code>
                <span><b>{Math.max(0, Math.round((file.bytes - HEADER_BYTES) / BAR_BYTES))}</b> bars · {(file.bytes / 1024).toFixed(1)} KB</span>
              </li>
            ))}
          </ul>
          <div className="ci-actions">
            <button type="button" onClick={() => { window.location.reload() }}>Reload the page</button>
            <button type="button" onClick={() => { void refresh() }}>Refresh</button>
            <button type="button" onClick={() => { void clear() }}>Clear saved bars</button>
          </div>
          <p className="ci-note">Try it: reload and compare. With bars saved, the second load asks the datafeed for only the newest few instead of the whole window.</p>
        </div>
      </div>
    </div>
  )
}
