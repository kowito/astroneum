import {
  DATAFEED_ERROR_EVENT,
  STANDARD_CRYPTO_SYMBOLS,
  createStandardCryptoDatafeed,
  type DatafeedErrorDetail,
  type DatafeedErrorType,
  type SymbolInfo,
} from 'astroneum'

export const MOCK_SYMBOLS: readonly SymbolInfo[] = STANDARD_CRYPTO_SYMBOLS

export { DATAFEED_ERROR_EVENT }
export type { DatafeedErrorDetail, DatafeedErrorType }

const MockDatafeed = createStandardCryptoDatafeed({
  symbols: MOCK_SYMBOLS,
})

export default MockDatafeed
