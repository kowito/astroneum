import { useMemo, useState } from 'react'

import { type Component } from '@/react-shared'

import type { OverlayCreate, OverlayMode } from '@/types'

import i18n from '@/i18n'
import { List } from '@/component'
import { DRAWING_GROUP_ID } from '@/constants'
import {
  createSingleLineOptions, createMoreLineOptions,
  createPolygonOptions, createFibonacciOptions, createWaveOptions,
  createMagnetOptions,
  Icon
} from './icons'

export interface DrawingBarProps {
  locale: string
  onDrawingItemClick: (overlay: OverlayCreate) => void
  onModeChange: (mode: string) => void,
  onLockChange: (lock: boolean) => void
  onVisibleChange: (visible: boolean) => void
  onRemoveClick: (groupId: string) => void
  onSnapLevelsChange?: (active: boolean) => void
}

/** The small chevron that opens a tool group's flyout. */
const Chevron = ({ open }: { open: boolean }) => (
  <svg className={open ? 'rotate' : ''} viewBox="0 0 6 10" width="6" height="10" aria-hidden="true">
    <path d="M1.5 1.5L4.5 5L1.5 8.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const DrawingBar: Component<DrawingBarProps> = props => {
  const [singleLineIcon, setSingleLineIcon] = useState('horizontalStraightLine')
  const [moreLineIcon, setMoreLineIcon] = useState('priceChannelLine')
  const [polygonIcon, setPolygonIcon] = useState('circle')
  const [fibonacciIcon, setFibonacciIcon] = useState('fibonacciLine')
  const [waveIcon, setWaveIcon] = useState('abcd')

  const [modeIcon, setModeIcon] = useState('weak_magnet')
  const [mode, setMode] = useState('normal')

  const [snapLevelsActive, setSnapLevelsActive] = useState(false)

  const [lock, setLock] = useState(false)

  const [visible, setVisible] = useState(true)

  const [popoverKey, setPopoverKey] = useState('')

  const overlays = useMemo(() => {
    return [
      { key: 'singleLine', icon: singleLineIcon, list: createSingleLineOptions(props.locale), setter: setSingleLineIcon },
      { key: 'moreLine', icon: moreLineIcon, list: createMoreLineOptions(props.locale), setter: setMoreLineIcon },
      { key: 'polygon', icon: polygonIcon, list: createPolygonOptions(props.locale), setter: setPolygonIcon },
      { key: 'fibonacci', icon: fibonacciIcon, list: createFibonacciOptions(props.locale), setter: setFibonacciIcon },
      { key: 'wave', icon: waveIcon, list: createWaveOptions(props.locale), setter: setWaveIcon }
    ]
  }, [singleLineIcon, moreLineIcon, polygonIcon, fibonacciIcon, waveIcon, props.locale])

  const modes = useMemo(() => createMagnetOptions(props.locale), [props.locale])

  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      className="astroneum-drawing-bar">
      {
        overlays.map(item => (
          <div
            key={item.key}
            className="item"
            role="group"
            aria-label={item.key}
            tabIndex={0}
            onBlur={() => { setPopoverKey('') }}>
            <span
              className="button"
              role="button"
              tabIndex={0}
              title={item.list.find(data => data.key === item.icon)?.text as string | undefined}
              aria-label={item.icon}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onDrawingItemClick({ groupId: DRAWING_GROUP_ID, name: item.icon, visible, lock, mode: mode as OverlayMode }) } }}
              onClick={() => { props.onDrawingItemClick({ groupId: DRAWING_GROUP_ID, name: item.icon, visible, lock, mode: mode as OverlayMode }) }}>
              <Icon name={item.icon} />
            </span>
            <div
              className={`icon-arrow ${item.key === popoverKey ? 'open' : ''}`}
              aria-label={`${item.key} tools`}
              onClick={() => {
                if (item.key === popoverKey) {
                  setPopoverKey('')
                } else {
                  setPopoverKey(item.key)
                }
              }}>
              <Chevron open={item.key === popoverKey}/>
            </div>
            {
              item.key === popoverKey && (
                <List className="list">
                  {
                    item.list.map(data => (
                      <li
                        key={data.key}
                        className={data.key === item.icon ? 'selected' : ''}
                        onClick={() => {
                          item.setter(data.key)
                          props.onDrawingItemClick({ name: data.key, lock, mode: mode as OverlayMode })
                          setPopoverKey('')
                        }}>
                        <Icon name={data.key}/>
                        <span className="label">{data.text}</span>
                      </li>
                    ))
                  }
                </List>
              )
            }
          </div>
        ))
      }
      <span className="split-line"/>
      <div
        className="item"
        tabIndex={0}
        onBlur={() => { setPopoverKey('') }}>
        <span
          className={`button ${mode !== 'normal' ? 'active' : ''}`}
          role="button"
          tabIndex={0}
          aria-pressed={mode !== 'normal'}
          title={modes.find(data => data.key === modeIcon)?.text as string | undefined}
          onClick={() => {
            let currentMode = modeIcon
            if (mode !== 'normal') {
              currentMode = 'no_magnet'
            }
            const engineMode = currentMode === 'no_magnet' ? 'normal' : currentMode
            setMode(engineMode)
            props.onModeChange(engineMode)
          }}>
          <Icon name={modeIcon === 'strong_magnet' ? 'strong_magnet' : 'weak_magnet'}/>
        </span>
        <div
          className={`icon-arrow ${popoverKey === 'mode' ? 'open' : ''}`}
          aria-label="magnet modes"
          onClick={() => {
            if (popoverKey === 'mode') {
              setPopoverKey('')
            } else {
              setPopoverKey('mode')
            }
          }}>
          <Chevron open={popoverKey === 'mode'}/>
        </div>
        {
          popoverKey === 'mode' && (
            <List className="list">
              {
                modes.map(data => (
                  <li
                    key={data.key}
                    className={(data.key === 'no_magnet' ? mode === 'normal' : mode === data.key) ? 'selected' : ''}
                    onClick={() => {
                      setModeIcon(data.key)
                      const engineMode = data.key === 'no_magnet' ? 'normal' : data.key
                      setMode(engineMode)
                      props.onModeChange(engineMode)
                      setPopoverKey('')
                    }}>
                    <Icon name={data.key}/>
                    <span className="label">{data.text}</span>
                  </li>
                ))
              }
            </List>
          )
        }
      </div>
      <div
        className="item">
        <span
          className={`button ${lock ? 'active' : ''}`}
          role="button"
          tabIndex={0}
          aria-pressed={lock}
          title={i18n(lock ? 'unlock_drawings' : 'lock_drawings', props.locale)}
          onClick={() => {
            const currentLock = !lock
            setLock(currentLock)
            props.onLockChange(currentLock)
          }}>
          {
            lock ? <Icon name="lock"/> : <Icon name="unlock" />
          }
        </span>
      </div>
      <div
        className="item">
        <span
          className={`button ${visible ? '' : 'active'}`}
          role="button"
          tabIndex={0}
          aria-pressed={!visible}
          title={i18n(visible ? 'hide_drawings' : 'show_drawings', props.locale)}
          onClick={() => {
            const nextVisible = !visible
            setVisible(nextVisible)
            props.onVisibleChange(nextVisible)
          }}>
          {
            visible ? <Icon name="visible" /> : <Icon name="invisible" />
          }
        </span>
      </div>
      <span className="split-line"/>
      <div
        className="item"
        title={i18n('snap_levels', props.locale)}>
        <span
          className={`button ${snapLevelsActive ? 'active' : ''}`}
          role="button"
          tabIndex={0}
          aria-pressed={snapLevelsActive}
          aria-label={i18n('snap_levels', props.locale)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              const nextSnapLevelsActive = !snapLevelsActive
              setSnapLevelsActive(nextSnapLevelsActive)
              props.onSnapLevelsChange?.(nextSnapLevelsActive)
            }
          }}
          onClick={() => {
            const nextSnapLevelsActive = !snapLevelsActive
            setSnapLevelsActive(nextSnapLevelsActive)
            props.onSnapLevelsChange?.(nextSnapLevelsActive)
          }}>
          <Icon name="snap_levels" />
        </span>
      </div>
      <div
        className="item">
        <span
          className="button"
          role="button"
          tabIndex={0}
          title={i18n('remove_drawings', props.locale)}
          onClick={() => { props.onRemoveClick(DRAWING_GROUP_ID) }}>
          <Icon name="remove" />
        </span>
      </div>
    </div>
  )
}

export default DrawingBar