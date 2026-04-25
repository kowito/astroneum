import type { AxisCreate } from '../component/Axis'

export type PaneState = 'normal' | 'maximize' | 'minimize'

export interface PaneOptions {
  id?: string
  height?: number
  minHeight?: number
  dragEnabled?: boolean
  order?: number
  state?: PaneState,
  axis?: Partial<AxisCreate>
}

export const PANE_MIN_HEIGHT = 30

export const PANE_DEFAULT_HEIGHT = 100

export const PaneIdConstants = {
  CANDLE: 'candle_pane',
  INDICATOR: 'indicator_pane_',
  X_AXIS: 'x_axis_pane'
}
