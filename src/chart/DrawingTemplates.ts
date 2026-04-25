/**
 * Drawing Style Templates & Presets
 *
 * Provides named overlay style presets that users can apply to drawing tools,
 * plus save/load of custom templates to localStorage.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OverlayStylePreset {
  /** Unique identifier for this preset. */
  id: string
  /** Human-readable display name. */
  name: string
  /** Partial overlay style object compatible with the engine's overlay styles. */
  styles: DrawingStyleTemplate
}

export interface DrawingStyleTemplate {
  line?: {
    color?: string
    size?: number
    style?: 'solid' | 'dashed' | 'dotted'
  }
  polygon?: {
    color?: string
  }
  text?: {
    color?: string
    size?: number
    family?: string
    weight?: string
  }
  rectText?: {
    color?: string
    size?: number
    family?: string
    weight?: string
    paddingLeft?: number
    paddingRight?: number
    paddingTop?: number
    paddingBottom?: number
    borderRadius?: number
    borderSize?: number
    borderColor?: string
    backgroundColor?: string
  }
  point?: {
    color?: string
    radius?: number
    borderColor?: string
    borderSize?: number
  }
}

// ---------------------------------------------------------------------------
// Built-in presets
// ---------------------------------------------------------------------------

const BUILT_IN_PRESETS: OverlayStylePreset[] = [
  {
    id: 'default',
    name: 'Default',
    styles: {
      line: { color: '#1677FF', size: 1, style: 'solid' },
      polygon: { color: 'rgba(22,119,255,0.15)' },
      text: { color: '#1677FF', size: 12, family: 'Helvetica Neue', weight: 'normal' },
      point: { color: '#1677FF', radius: 4, borderColor: '#ffffff', borderSize: 2 }
    }
  },
  {
    id: 'bullish',
    name: 'Bullish (Green)',
    styles: {
      line: { color: '#22ab94', size: 1, style: 'solid' },
      polygon: { color: 'rgba(34,171,148,0.15)' },
      text: { color: '#22ab94', size: 12, family: 'Helvetica Neue', weight: 'normal' },
      point: { color: '#22ab94', radius: 4, borderColor: '#ffffff', borderSize: 2 }
    }
  },
  {
    id: 'bearish',
    name: 'Bearish (Red)',
    styles: {
      line: { color: '#f7525f', size: 1, style: 'solid' },
      polygon: { color: 'rgba(247,82,95,0.15)' },
      text: { color: '#f7525f', size: 12, family: 'Helvetica Neue', weight: 'normal' },
      point: { color: '#f7525f', radius: 4, borderColor: '#ffffff', borderSize: 2 }
    }
  },
  {
    id: 'neutral',
    name: 'Neutral (Gray)',
    styles: {
      line: { color: '#9598a1', size: 1, style: 'solid' },
      polygon: { color: 'rgba(149,152,161,0.15)' },
      text: { color: '#9598a1', size: 12, family: 'Helvetica Neue', weight: 'normal' },
      point: { color: '#9598a1', radius: 4, borderColor: '#ffffff', borderSize: 2 }
    }
  },
  {
    id: 'highlight',
    name: 'Highlight (Yellow)',
    styles: {
      line: { color: '#f6a825', size: 2, style: 'solid' },
      polygon: { color: 'rgba(246,168,37,0.18)' },
      text: { color: '#f6a825', size: 13, family: 'Helvetica Neue', weight: 'bold' },
      point: { color: '#f6a825', radius: 5, borderColor: '#ffffff', borderSize: 2 }
    }
  },
  {
    id: 'dashed_blue',
    name: 'Dashed Blue',
    styles: {
      line: { color: '#1677FF', size: 1, style: 'dashed' },
      polygon: { color: 'rgba(22,119,255,0.10)' },
      text: { color: '#1677FF', size: 12, family: 'Helvetica Neue', weight: 'normal' },
      point: { color: '#1677FF', radius: 4, borderColor: '#ffffff', borderSize: 2 }
    }
  },
  {
    id: 'thick_orange',
    name: 'Thick Orange',
    styles: {
      line: { color: '#f77c00', size: 3, style: 'solid' },
      polygon: { color: 'rgba(247,124,0,0.15)' },
      text: { color: '#f77c00', size: 13, family: 'Helvetica Neue', weight: 'bold' },
      point: { color: '#f77c00', radius: 6, borderColor: '#ffffff', borderSize: 2 }
    }
  }
]

// ---------------------------------------------------------------------------
// DrawingTemplates manager
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'astroneum-drawing-templates'

/**
 * Manager for drawing style presets.
 * Provides access to built-in presets and allows saving/loading custom ones.
 *
 * @example
 * ```ts
 * const templates = DrawingTemplates.getInstance()
 * const preset = templates.getPreset('bullish')
 * // Apply preset.styles to an overlay via chart.overrideOverlay(...)
 * ```
 */
export class DrawingTemplates {
  private static _instance: DrawingTemplates | null = null
  private _custom: OverlayStylePreset[] = []

  private constructor () {
    this._loadCustom()
  }

  static getInstance (): DrawingTemplates {
    if (!DrawingTemplates._instance) {
      DrawingTemplates._instance = new DrawingTemplates()
    }
    return DrawingTemplates._instance
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _loadCustom (): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        this._custom = JSON.parse(raw) as OverlayStylePreset[]
      }
    } catch {
      this._custom = []
    }
  }

  private _saveCustom (): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._custom))
    } catch {
      // ignore
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Return all presets (built-in first, then custom). */
  getAll (): OverlayStylePreset[] {
    return [...BUILT_IN_PRESETS, ...this._custom]
  }

  /** Return built-in presets only. */
  getBuiltIn (): OverlayStylePreset[] {
    return [...BUILT_IN_PRESETS]
  }

  /** Return user-saved custom presets. */
  getCustom (): OverlayStylePreset[] {
    return [...this._custom]
  }

  /** Find a preset by id (searches built-ins then custom). */
  getPreset (id: string): OverlayStylePreset | undefined {
    return this.getAll().find(p => p.id === id)
  }

  /**
   * Save a new custom preset (or overwrite an existing custom one with the same id).
   * Note: built-in preset ids cannot be overwritten.
   */
  saveCustomPreset (preset: OverlayStylePreset): void {
    if (BUILT_IN_PRESETS.some(p => p.id === preset.id)) {
      throw new Error(`Cannot overwrite built-in preset "${preset.id}"`)
    }
    const idx = this._custom.findIndex(p => p.id === preset.id)
    if (idx >= 0) {
      this._custom[idx] = preset
    } else {
      this._custom.push(preset)
    }
    this._saveCustom()
  }

  /** Delete a custom preset by id. Built-in presets cannot be deleted. */
  deleteCustomPreset (id: string): boolean {
    if (BUILT_IN_PRESETS.some(p => p.id === id)) {
      return false
    }
    const before = this._custom.length
    this._custom = this._custom.filter(p => p.id !== id)
    if (this._custom.length < before) {
      this._saveCustom()
      return true
    }
    return false
  }

  /**
   * Apply a preset to an engine overlay via overrideOverlay.
   * Returns the styles object ready to pass to `chart.overrideOverlay({ groupId, styles })`.
   */
  toOverlayStyles (presetId: string): DrawingStyleTemplate | undefined {
    return this.getPreset(presetId)?.styles
  }
}

export default DrawingTemplates
