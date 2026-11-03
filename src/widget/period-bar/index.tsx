import { useEffect, useState } from 'react'

import { type Component } from '@/react-shared'

import { type SymbolInfo, type Period } from '@/types'

import i18n from '@/i18n'

import {
  SidebarIcon, SearchIcon, IndicatorsIcon, AlertIcon, TimezoneIcon,
  SettingsIcon, ScreenshotIcon, FullscreenIcon, ExitFullscreenIcon
} from './icons'

export interface PeriodBarProps {
  locale: string
  spread: boolean
  symbol: SymbolInfo
  period: Period
  periods: Period[]
  onMenuClick: () => void
  onSymbolClick: () => void
  onPeriodChange: (period: Period) => void
  onIndicatorClick: () => void
  onTimezoneClick: () => void
  onSettingClick: () => void
  onScreenshotClick: () => void
  onAlertClick?: () => void
}

const fullscreenEvents = ['fullscreenchange', 'mozfullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange'] as const

function enterFullScreen (el: HTMLElement) {
  // @ts-expect-error vendor-prefixed fullscreen API
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const requestFullscreenFn = el.requestFullscreen ?? el.webkitRequestFullscreen ?? el.mozRequestFullScreen ?? el.msRequestFullscreen
  void (requestFullscreenFn as (() => Promise<void>) | undefined)?.call(el)
}

function exitFullScreen () {
  // @ts-expect-error vendor-prefixed fullscreen API
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const exitFullscreenFn = document.exitFullscreen ?? document.msExitFullscreen ?? document.mozCancelFullScreen ?? document.webkitExitFullscreen
  void (exitFullscreenFn as (() => Promise<void>) | undefined)?.call(document)
}

function periodsEqual (a: Period, b: Period): boolean {
  return a.multiplier === b.multiplier && a.timespan === b.timespan
}

const PeriodBar: Component<PeriodBarProps> = props => {
  let ref: Node

  const [fullScreen, setFullScreen] = useState(false)

  const fullScreenChange = (): void => {
    setFullScreen(document.fullscreenElement !== null)
  }

  useEffect(() => {
    fullscreenEvents.forEach(e => document.addEventListener(e, fullScreenChange))

    return () => {
      fullscreenEvents.forEach(e => document.removeEventListener(e, fullScreenChange))
    }
  }, [])

  const toggleFullScreen = (): void => {
    if (!fullScreen) {
      const el = ref?.parentElement
      if (el) { enterFullScreen(el) }
    } else {
      exitFullScreen()
    }
  }

  const symbolText = props.symbol?.shortName ?? props.symbol?.name ?? props.symbol?.ticker ?? ''

  return (
    <div
      ref={el => { ref = el }}
      role="toolbar"
      aria-label="Chart toolbar"
      className="astroneum-period-bar">
      <div className='menu-container'>
        <button
          type="button"
          className={`icon-button ${props.spread ? '' : 'collapsed'}`}
          aria-label="Toggle drawing toolbar"
          aria-expanded={props.spread}
          onClick={props.onMenuClick}>
          <SidebarIcon/>
        </button>
      </div>
      <div className="group">
        {props.symbol && (
          <button
            type="button"
            className="symbol"
            aria-label={`Symbol: ${symbolText}`}
            onClick={props.onSymbolClick}>
            <SearchIcon/>
            {props.symbol.logo && <img alt="" src={props.symbol.logo}/>}
            <span>{symbolText}</span>
          </button>
        )}
        <span className="separator" aria-hidden="true"/>
        <div className="periods" role="group" aria-label="Periods">
        {
          props.periods.map(p => (
            <button
              type="button"
              key={p.text}
              className={`item period ${periodsEqual(p, props.period) ? 'selected' : ''}`}
              aria-pressed={periodsEqual(p, props.period)}
              aria-label={`Period: ${p.text}`}
              onClick={() => { props.onPeriodChange(p) }}>
              {p.text}
            </button>
          ))
        }
        </div>
        <span className="separator" aria-hidden="true"/>
        <button
          type="button"
          className='item tools'
          aria-label={i18n('indicator', props.locale)}
          onClick={props.onIndicatorClick}>
          <IndicatorsIcon/>
          <span>{i18n('indicator', props.locale)}</span>
        </button>
        {props.onAlertClick && (
          <button
            type="button"
            className='item tools'
            aria-label={i18n('alerts', props.locale)}
            onClick={props.onAlertClick}>
            <AlertIcon/>
            <span>{i18n('alerts', props.locale)}</span>
          </button>
        )}
      </div>
      <div className="group right">
        <button
          type="button"
          className='item tools icon-only'
          title={i18n('timezone', props.locale)}
          aria-label={i18n('timezone', props.locale)}
          onClick={props.onTimezoneClick}>
          <TimezoneIcon/>
        </button>
        <button
          type="button"
          className='item tools icon-only'
          title={i18n('setting', props.locale)}
          aria-label={i18n('setting', props.locale)}
          onClick={props.onSettingClick}>
          <SettingsIcon/>
        </button>
        <button
          type="button"
          className='item tools icon-only'
          title={i18n('screenshot', props.locale)}
          aria-label={i18n('screenshot', props.locale)}
          onClick={props.onScreenshotClick}>
          <ScreenshotIcon/>
        </button>
        <button
          type="button"
          className='item tools icon-only'
          title={i18n(fullScreen ? 'exit_full_screen' : 'full_screen', props.locale)}
          aria-label={i18n(fullScreen ? 'exit_full_screen' : 'full_screen', props.locale)}
          onClick={toggleFullScreen}>
          {fullScreen ? <ExitFullscreenIcon/> : <FullscreenIcon/>}
        </button>
      </div>
    </div>
  )
}

export default PeriodBar
