import type Nullable from './Nullable'
import type { CandleData } from './Data'
import type { SymbolInfo } from './SymbolInfo'
import type { Period } from './Period'

export type DataLoadType = 'init' | 'forward' | 'backward' | 'update'

export type DataLoadMore = boolean | {
  backward?: boolean
  forward?: boolean
}

export interface DataLoaderGetBarsParams {
  type: DataLoadType
  timestamp: Nullable<number>
  symbol: SymbolInfo
  period: Period
  callback: (data: CandleData[], more?: DataLoadMore) => void
}

export interface DataLoaderSubscribeBarParams {
  symbol: SymbolInfo
  period: Period
  callback: (data: CandleData) => void
}

export type DataLoaderUnsubscribeBarParams = Omit<DataLoaderSubscribeBarParams, 'callback'>

export interface DataLoader {
  getBars: (params: DataLoaderGetBarsParams) => void | Promise<void>
  subscribeBar?: (params: DataLoaderSubscribeBarParams) => void
  unsubscribeBar?: (params: DataLoaderUnsubscribeBarParams) => void
}
