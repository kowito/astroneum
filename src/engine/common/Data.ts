import type Nullable from './Nullable'

export interface NeighborData<D> {
  prev: D
  current: D
  next: D
}

export type Timestamp = number

export interface CandleData {
  timestamp: Timestamp
  open: number
  high: number
  low: number
  close: number
  volume?: number
  turnover?: number
  [key: string]: unknown
}

export interface VisibleRangeData {
  dataIndex: number
  x: number
  data: NeighborData<Nullable<CandleData>>
}
