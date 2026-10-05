'use client'

import { useState } from 'react'

import CodeBlock from './CodeBlock'

const MANAGERS = [
  { id: 'npm', command: 'npm install astroneum' },
  { id: 'pnpm', command: 'pnpm add astroneum' },
  { id: 'yarn', command: 'yarn add astroneum' },
] as const

/** An install command with a tab per package manager. */
export default function PackageTabs() {
  const [active, setActive] = useState<typeof MANAGERS[number]['id']>('npm')
  const current = MANAGERS.find(manager => manager.id === active) ?? MANAGERS[0]
  return (
    <div className="dc-tabs">
      <div role="tablist" aria-label="Package manager">
        {MANAGERS.map(manager => (
          <button
            key={manager.id}
            type="button"
            role="tab"
            aria-selected={manager.id === active}
            onClick={() => { setActive(manager.id) }}
          >
            {manager.id}
          </button>
        ))}
      </div>
      <CodeBlock code={current.command} lang="bash" noCopy={false} title={current.id} />
    </div>
  )
}
