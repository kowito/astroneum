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
  const [waveIcon, setWaveIcon] = useState('xabcd')

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
      class="astroneum-drawing-bar">
      {
        overlays.map(item => (
          <div
            class="item"
            role="group"
            aria-label={item.key}
            tabIndex={0}
            onBlur={() => { setPopoverKey('') }}>
            <span
              style="width:32px;height:32px"
              role="button"
              tabIndex={0}
              aria-label={item.icon}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onDrawingItemClick({ groupId: DRAWING_GROUP_ID, name: item.icon, visible, lock, mode: mode as OverlayMode }) } }}
              onClick={() => { props.onDrawingItemClick({ groupId: DRAWING_GROUP_ID, name: item.icon, visible, lock, mode: mode as OverlayMode }) }}>
              <Icon name={item.icon} />
            </span>
            <div
              class="icon-arrow"
              onClick={() => {
                if (item.key === popoverKey) {
                  setPopoverKey('')
                } else {
                  setPopoverKey(item.key)
                }
              }}>
              <svg
                class={item.key === popoverKey ? 'rotate' : ''}
                viewBox="0 0 4 6">
                <path d="M1.07298,0.159458C0.827521,-0.0531526,0.429553,-0.0531526,0.184094,0.159458C-0.0613648,0.372068,-0.0613648,0.716778,0.184094,0.929388L2.61275,3.03303L0.260362,5.07061C0.0149035,5.28322,0.0149035,5.62793,0.260362,5.84054C0.505822,6.05315,0.903789,6.05315,1.14925,5.84054L3.81591,3.53075C4.01812,3.3556,4.05374,3.0908,3.92279,2.88406C3.93219,2.73496,3.87113,2.58315,3.73964,2.46925L1.07298,0.159458Z" stroke="none" stroke-opacity="0"/>
              </svg>
            </div>
            {
              item.key === popoverKey && (
                <List class="list">
                  {
                    item.list.map(data => (
                      <li
                        onClick={() => {
                          item.setter(data.key)
                          props.onDrawingItemClick({ name: data.key, lock, mode: mode as OverlayMode })
                          setPopoverKey('')
                        }}>
                        <Icon name={data.key}/>
                        <span style="padding-left:8px">{data.text}</span>
                      </li>
                    ))
                  }
                </List>
              )
            }
          </div>
        ))
      }
      <span class="split-line"/>
      <div
        class="item"
        tabIndex={0}
        onBlur={() => { setPopoverKey('') }}>
        <span
          style="width:32px;height:32px"
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
              ? (mode === 'weak_magnet' ? <Icon name="weak_magnet" class="selected"/> : <Icon name="weak_magnet"/>) 
              : (mode === 'strong_magnet' ? <Icon name="strong_magnet" class="selected"/> : <Icon name="strong_magnet"/>)
          }
        </span>
        <div
          class="icon-arrow"
          onClick={() => {
            if (popoverKey === 'mode') {
              setPopoverKey('')
            } else {
              setPopoverKey('mode')
            }
          }}>
          <svg
            class={popoverKey === 'mode' ? 'rotate' : ''}
            viewBox="0 0 4 6">
            <path d="M1.07298,0.159458C0.827521,-0.0531526,0.429553,-0.0531526,0.184094,0.159458C-0.0613648,0.372068,-0.0613648,0.716778,0.184094,0.929388L2.61275,3.03303L0.260362,5.07061C0.0149035,5.28322,0.0149035,5.62793,0.260362,5.84054C0.505822,6.05315,0.903789,6.05315,1.14925,5.84054L3.81591,3.53075C4.01812,3.3556,4.05374,3.0908,3.92279,2.88406C3.93219,2.73496,3.87113,2.58315,3.73964,2.46925L1.07298,0.159458Z" stroke="none" stroke-opacity="0"/>
          </svg>
        </div>
        {
          popoverKey === 'mode' && (
            <List class="list">
              {
                modes.map(data => (
                  <li
                    onClick={() => {
                      setModeIcon(data.key)
                      const engineMode = data.key === 'no_magnet' ? 'normal' : data.key
                      setMode(engineMode)
                      props.onModeChange(engineMode)
                      setPopoverKey('')
                    }}>
                    <Icon name={data.key}/>
                    <span style="padding-left:8px">{data.text}</span>
                  </li>
                ))
              }
            </List>
          )
        }
      </div>
      <div
        class="item">
        <span
          style="width:32px;height:32px"
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
        class="item">
        <span
          style="width:32px;height:32px"
          onClick={() => {
            const v = !visible
            setVisible(v)
            props.onVisibleChange(v)
          }}>
          {
            visible ? <Icon name="visible" /> : <Icon name="invisible" />
          }
        </span>
      </div>
      <span class="split-line"/>
      <div
        class="item"
        title={i18n('snap_levels', props.locale)}>
        <span
          role="button"
          tabIndex={0}
          style="width:32px;height:32px"
          aria-pressed={snapLevelsActive}
          aria-label={i18n('snap_levels', props.locale)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const v = !snapLevelsActive; setSnapLevelsActive(v); props.onSnapLevelsChange?.(v) } }}
          onClick={() => {
            const v = !snapLevelsActive
            setSnapLevelsActive(v)
            props.onSnapLevelsChange?.(v)
          }}>
          <Icon name={snapLevelsActive ? 'snap_levels' : 'snap_levels'} class={snapLevelsActive ? 'selected' : ''} />
        </span>
      </div>
      <div
        class="item">
        <span
          style="width:32px;height:32px"
          onClick={() => { props.onRemoveClick(DRAWING_GROUP_ID) }}>
          <Icon name="remove" />
        </span>
      </div>
    </div>
  )
}

export default DrawingBar