import type Coordinate from './Coordinate'
import type { CandleData } from './Data'

export default interface Crosshair extends Partial<Coordinate> {
  paneId?: string
  realX?: number
  timestamp?: number
  candleData?: CandleData
  dataIndex?: number
  realDataIndex?: number
}
