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
              style={{width:"32px",height:"32px"}}
              role="button"
              tabIndex={0}
              aria-label={item.icon}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onDrawingItemClick({ groupId: DRAWING_GROUP_ID, name: item.icon, visible, lock, mode: mode as OverlayMode }) } }}
              onClick={() => { props.onDrawingItemClick({ groupId: DRAWING_GROUP_ID, name: item.icon, visible, lock, mode: mode as OverlayMode }) }}>
              <Icon name={item.icon} />
            </span>
            <div
              className="icon-arrow"
              onClick={() => {
                if (item.key === popoverKey) {
                  setPopoverKey('')
                } else {
                  setPopoverKey(item.key)
                }
              }}>
              <svg
                className={item.key === popoverKey ? 'rotate' : ''}
                viewBox="0 0 4 6">
                <path d="M1.07,0.16C0.83,-0.05,0.43,-0.05,0.18,0.16C-0.06,0.37,-0.06,0.72,0.18,0.93L2.61,3.03L0.26,5.07C0.01,5.28,0.01,5.63,0.26,5.84C0.51,6.05,0.9,6.05,1.15,5.84L3.82,3.53C4.02,3.36,4.05,3.09,3.92,2.88C3.93,2.73,3.87,2.58,3.74,2.47L1.07,0.16Z" stroke="none" strokeOpacity={0}/>
              </svg>
            </div>
            {
              item.key === popoverKey && (
                <List className="list">
                  {
                    item.list.map(data => (
                      <li
                        key={data.key}
                        onClick={() => {
                          item.setter(data.key)
                          props.onDrawingItemClick({ name: data.key, lock, mode: mode as OverlayMode })
                          setPopoverKey('')
                        }}>
                        <Icon name={data.key}/>
                        <span style={{paddingLeft:"8px"}}>{data.text}</span>
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
          style={{width:"32px",height:"32px"}}
          onClick={() => {
            let currentMode = modeIcon
            if (mode !== 'normal') {
              currentMode = 'no_magnet'
            }
            const engineMode = currentMode === 'no_magnet' ? 'normal' : currentMode
            setMode(engineMode)
            props.onModeChange(engineMode)
          }}>
          {
            modeIcon === 'weak_magnet'
              ? (mode === 'weak_magnet' ? <Icon name="weak_magnet" className="selected"/> : <Icon name="weak_magnet"/>) 
              : (mode === 'strong_magnet' ? <Icon name="strong_magnet" className="selected"/> : <Icon name="strong_magnet"/>)
          }
        </span>
        <div
          className="icon-arrow"
          onClick={() => {
            if (popoverKey === 'mode') {
              setPopoverKey('')
            } else {
              setPopoverKey('mode')
            }
          }}>
          <svg
            className={popoverKey === 'mode' ? 'rotate' : ''}
            viewBox="0 0 4 6">
            <path d="M1.07,0.16C0.83,-0.05,0.43,-0.05,0.18,0.16C-0.06,0.37,-0.06,0.72,0.18,0.93L2.61,3.03L0.26,5.07C0.01,5.28,0.01,5.63,0.26,5.84C0.51,6.05,0.9,6.05,1.15,5.84L3.82,3.53C4.02,3.36,4.05,3.09,3.92,2.88C3.93,2.73,3.87,2.58,3.74,2.47L1.07,0.16Z" stroke="none" strokeOpacity={0}/>
          </svg>
        </div>
        {
          popoverKey === 'mode' && (
            <List className="list">
              {
                modes.map(data => (
                  <li
                    key={data.key}
                    onClick={() => {
                      setModeIcon(data.key)
                      const engineMode = data.key === 'no_magnet' ? 'normal' : data.key
                      setMode(engineMode)
                      props.onModeChange(engineMode)
                      setPopoverKey('')
                    }}>
                    <Icon name={data.key}/>
                    <span style={{paddingLeft:"8px"}}>{data.text}</span>
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
          style={{width:"32px",height:"32px"}}
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
          style={{width:"32px",height:"32px"}}
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
          role="button"
          tabIndex={0}
          style={{width:"32px",height:"32px"}}
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
          <Icon name={snapLevelsActive ? 'snap_levels' : 'snap_levels'} className={snapLevelsActive ? 'selected' : ''} />
        </span>
      </div>
      <div
        className="item">
        <span
          style={{width:"32px",height:"32px"}}
          onClick={() => { props.onRemoveClick(DRAWING_GROUP_ID) }}>
          <Icon name="remove" />
        </span>
      </div>
    </div>
  )
}

export default DrawingBar