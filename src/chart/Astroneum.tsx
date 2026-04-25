import { render } from '@/react-render'

import { utils } from '@/engine'
import type { Nullable, DeepPartial, Styles } from '@/types'

import ChartProComponent from './ChartProComponent'
import logoSvgRaw from '@/assets/logo.svg'

import { type SymbolInfo, type Period, type ChartPro, type ChartProOptions } from '@/types'

function getSystemTheme (): 'dark' | 'light' {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function createLogoNode (): Node {
  const div = document.createElement('div')
  div.innerHTML = logoSvgRaw
  const svg = div.firstElementChild as SVGElement
  svg.classList.add('logo')
  return svg
}

export default class Astroneum implements ChartPro {
  constructor (options: ChartProOptions) {
    if (utils.isString(options.container)) {
      this._container = document.getElementById(options.container)
      if (!this._container) {
        throw new Error('Container is null')
      }
    } else {
      this._container = options.container
    }
    this._container.classList.add('astroneum')
    this._container.setAttribute('data-theme', options.theme ?? getSystemTheme())

    render(
      () => (
        <ChartProComponent
          ref={(chart: ChartPro) => { this._chartApi = chart }}
          styles={options.styles ?? {}}
          watermark={options.watermark ?? createLogoNode()}
          theme={options.theme ?? getSystemTheme()}
          locale={options.locale ?? 'en-US'}
          drawingBarVisible={options.drawingBarVisible ?? true}
          symbol={options.symbol}
          period={options.period}
          periods={
            options.periods ?? [
              { multiplier: 1, timespan: 'minute', text: '1m' },
              { multiplier: 5, timespan: 'minute', text: '5m' },
              { multiplier: 15, timespan: 'minute', text: '15m' },
              { multiplier: 1, timespan: 'hour', text: '1H' },
              { multiplier: 2, timespan: 'hour', text: '2H' },
              { multiplier: 4, timespan: 'hour', text: '4H' },
              { multiplier: 1, timespan: 'day', text: 'D' },
              { multiplier: 1, timespan: 'week', text: 'W' },
              { multiplier: 1, timespan: 'month', text: 'M' },
              { multiplier: 1, timespan: 'year', text: 'Y' }
            ]
          }
          timezone={options.timezone ?? 'Asia/Shanghai'}
          mainIndicators={options.mainIndicators ?? [{ name: 'EMA', calcParams: [7, 25, 99] }]}
          subIndicators={options.subIndicators ?? ['VOL']}
          datafeed={options.datafeed}/>
      ),
      this._container
    )
  }

  private _container: Nullable<HTMLElement>

  private _chartApi: Nullable<ChartPro> = null


  setTheme (theme: string): void {
    this._container?.setAttribute('data-theme', theme)
    this._chartApi!.setTheme(theme)
  }

  getTheme (): string {
    return this._chartApi!.getTheme()
  }

  setStyles(styles: DeepPartial<Styles>): void {
    this._chartApi!.setStyles(styles)
  }

  getStyles(): Styles {
    return this._chartApi!.getStyles()
  }

  setLocale (locale: string): void {
    this._chartApi!.setLocale(locale)
  }

  getLocale (): string {
    return this._chartApi!.getLocale()
  }

  setTimezone (timezone: string): void {
    this._chartApi!.setTimezone(timezone)
  }

  getTimezone (): string {
    return this._chartApi!.getTimezone()
  }

  setSymbol (symbol: SymbolInfo): void {
    this._chartApi!.setSymbol(symbol)
  }

  getSymbol (): SymbolInfo {
    return this._chartApi!.getSymbol()
  }

  setPeriod (period: Period): void {
    this._chartApi!.setPeriod(period)
  }

  getPeriod (): Period {
    return this._chartApi!.getPeriod()
  }
}
