'use client'

import { useEffect, useId, useRef, useState } from 'react'

// Colours match the docs theme (see docs.css).
const THEME = {
  background: 'transparent',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: '14px',
  primaryColor: '#1c2430',
  primaryTextColor: '#e6edf3',
  primaryBorderColor: '#58a6ff',
  secondaryColor: '#161b22',
  tertiaryColor: '#12161d',
  lineColor: '#8b949e',
  textColor: '#e6edf3',
  mainBkg: '#1c2430',
  nodeBorder: '#58a6ff',
  clusterBkg: '#12161d',
  clusterBorder: '#30363d',
  edgeLabelBackground: '#0d1117',
  titleColor: '#e6edf3',
  noteBkgColor: '#3d2e00',
  noteTextColor: '#f2cc60',
  noteBorderColor: '#d29922',
  actorBkg: '#1c2430',
  actorBorder: '#58a6ff',
  actorTextColor: '#e6edf3',
  actorLineColor: '#484f58',
  signalColor: '#c9d1d9',
  signalTextColor: '#e6edf3',
  labelBoxBkgColor: '#1c2430',
  labelBoxBorderColor: '#58a6ff',
  labelTextColor: '#e6edf3',
  loopTextColor: '#e6edf3',
  activationBkgColor: '#1f6feb',
}

// Smallest share of its natural size a diagram is drawn at before the box scrolls sideways.
const MIN_SCALE = 0.66

// mermaid.render is not safe to run twice at once, so render one diagram at a time.
let queue: Promise<unknown> = Promise.resolve()

async function render(id: string, code: string): Promise<string> {
  const run = async (): Promise<string> => {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: THEME,
      flowchart: { curve: 'basis', padding: 12, htmlLabels: true },
      sequence: { mirrorActors: false, actorMargin: 40 },
    })
    const { svg } = await mermaid.render(id, code)
    return svg
  }
  const result = queue.then(run, run)
  queue = result.catch(() => undefined)
  return await result
}

/** Renders Mermaid source to an SVG in the browser. The library loads only when a diagram is on the page. */
export default function Mermaid({ code, label }: { code: string, label: string }) {
  const host = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [scrolls, setScrolls] = useState(false)
  const id = `mmd-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  useEffect(() => {
    let cancelled = false
    render(id, code)
      .then(svg => {
        if (cancelled || host.current === null) return
        host.current.innerHTML = svg
        // A wide diagram would shrink until its text is unreadable. Keep it at a readable size
        // and let the box scroll sideways instead.
        const el = host.current.querySelector('svg')
        const natural = el?.viewBox.baseVal.width ?? 0
        if (el !== null && natural > 0) el.style.minWidth = `${Math.round(natural * MIN_SCALE)}px`
        setState('ready')
      })
      .catch(() => { if (!cancelled) setState('error') })
    return () => { cancelled = true }
  }, [code, id])

  // Tell the reader when the diagram is wider than its box, so a clipped edge is not mistaken for the end.
  useEffect(() => {
    const el = box.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    const check = (): void => { setScrolls(el.scrollWidth > el.clientWidth + 1) }
    const observer = new ResizeObserver(check)
    observer.observe(el)
    check()
    return () => { observer.disconnect() }
  }, [state])

  return (
    <div ref={box} className="dc-mermaid" role="img" aria-label={label} data-state={state} data-scrolls={scrolls}>
      {state === 'loading' && <span className="dc-mermaid-note">Drawing diagram…</span>}
      {state === 'error' && <pre className="dc-mermaid-fallback">{code}</pre>}
      <div ref={host} />
    </div>
  )
}
