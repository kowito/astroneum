import i18n from '@/i18n'

type StylePath =
  | 'candle.type'
  | 'candle.priceMark.last.show'
  | 'candle.priceMark.high.show'
  | 'candle.priceMark.low.show'
  | 'indicator.lastValueMark.show'
  | 'yAxis.type'
  | 'yAxis.reverse'
  | 'grid.show'

interface SettingOption {
  key: StylePath
  text: string
  component: 'select' | 'switch'
  dataSource?: Array<{ key: string; text: string }>
}

export function getOptions (locale: string): SettingOption[] {
  return [
    {
      key: 'candle.type',
      text: i18n('candle_type', locale),
      component: 'select',
      dataSource: [
        { key: 'candle_solid', text: i18n('candle_solid', locale) },
        { key: 'candle_stroke', text: i18n('candle_stroke', locale) },
        { key: 'candle_up_stroke', text: i18n('candle_up_stroke', locale) },
        { key: 'candle_down_stroke', text: i18n('candle_down_stroke', locale) },
        { key: 'ohlc', text: i18n('ohlc', locale) },
        { key: 'area', text: i18n('area', locale) }
      ]
    },
    {
      key: 'candle.priceMark.last.show',
      text: i18n('last_price_show', locale),
      component: 'switch'
    },
    {
      key: 'candle.priceMark.high.show',
      text: i18n('high_price_show', locale),
      component: 'switch'
    },
    {
      key: 'candle.priceMark.low.show',
      text: i18n('low_price_show', locale),
      component: 'switch'
    },
    {
      key: 'indicator.lastValueMark.show',
      text: i18n('indicator_last_value_show', locale),
      component: 'switch'
    },
    {
      key: 'yAxis.type',
      text: i18n('price_axis_type', locale),
      component: 'select',
      dataSource: [
        { key: 'normal', text: i18n('normal', locale) },
        { key: 'percentage', text: i18n('percentage', locale) },
        { key: 'log', text: i18n('log', locale) }
      ],
    },
    {
      key: 'yAxis.reverse',
      text: i18n('reverse_coordinate', locale),
      component: 'switch',
    },
    {
      key: 'grid.show',
      text: i18n('grid_show', locale),
      component: 'switch',
    }
  ]
}
