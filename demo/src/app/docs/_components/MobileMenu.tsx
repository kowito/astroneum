'use client'

import { useState } from 'react'

import DocsNav from './DocsNav'

/** The sidebar as a drop-down for narrow screens. */
export default function MobileMenu() {
  const [open, setOpen] = useState(false)
  return (
    <div className="dc-mobile-menu">
      <button type="button" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>
        {open ? 'Close menu' : 'Documentation menu'}
      </button>
      {open && <DocsNav onNavigate={() => { setOpen(false) }} />}
    </div>
  )
}
