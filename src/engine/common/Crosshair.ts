import type Coordinate from './Coordinate'
import type { CandleData } from './Data'

export default interface Crosshair extends Partial<Coordinate> {
  paneId?: string
  realX?: number
  timestamp?: number
  kLineData?: CandleData
  dataIndex?: number
  realDataIndex?: number
}
