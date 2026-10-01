import type { IndicatorTemplate } from '../../component/Indicator'

interface CloseLine {
  close?: number
}

/**
 * Close-price line chart, drawn in its own pane under the candles.
 * Shares the time axis, zoom and crosshair with the main chart and follows
 * every live tick through the normal indicator recalculation.
 */
const closeLine: IndicatorTemplate<CloseLine> = {
  name: 'LINE',
  shortName: 'LINE',
  series: 'price',
  figures: [
    { key: 'close', title: 'Close: ', type: 'line' }
  ],
  calc: (dataList) => dataList.map(({ close }) => ({ close }))
}

export default closeLine
