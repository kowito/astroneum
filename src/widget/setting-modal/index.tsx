import { useEffect, useState, Fragment } from 'react'

import { type Component } from '@/react-shared'
import type { Styles, DeepPartial } from '@/types'
import { utils } from '@/engine'

import { deepSet } from '@/utils'

import { Modal, Select, Switch } from '@/component'
import type { SelectDataSourceItem } from '@/component'

import i18n from '@/i18n'
import { getOptions, isAxisSetting, type PriceAxisSetting } from './data'

export interface SettingModalProps {
  locale: string
  currentStyles: Styles
  currentAxis: PriceAxisSetting
  onClose: () => void
  onChange: (style: DeepPartial<Styles>) => void
  onAxisChange: (axis: PriceAxisSetting) => void
  onRestoreDefault: (options: SelectDataSourceItem[]) => void
}

const SettingModal: Component<SettingModalProps> = props => {
  const [styles, setStyles] = useState(props.currentStyles)
  const [axis, setAxis] = useState(props.currentAxis)
  const [options, setOptions] = useState(getOptions(props.locale))

  useEffect(() => {
    setOptions(getOptions(props.locale))
  }, [props.locale])

  const update = (option: SelectDataSourceItem, newValue: unknown) => {
    if (isAxisSetting(option.key)) {
      const next = { axis: { ...axis } }
      deepSet(next, option.key, newValue)
      setAxis(next.axis)
      props.onAxisChange(next.axis)
      return
    }
    const style = {}
    deepSet(style, option.key, newValue)
    const ss = utils.clone(styles)
    deepSet(ss, option.key, newValue)
    setStyles(ss)
    setOptions(options.map(op => ({ ...op })))
    props.onChange(style)
  }

  return (
    <Modal
      title={i18n('setting', props.locale)}
      width={560}
      overflowVisible
      buttons={[
        {
          children: i18n('restore_default', props.locale),
          onClick: () => {
            props.onRestoreDefault(options)
            props.onClose()
          }
        }
      ]}
      onClose={props.onClose}>
      <div
        className="astroneum-setting-modal-content">
        {options.map(option => {
          let component
          const value = isAxisSetting(option.key)
            ? utils.formatValue({ axis }, option.key)
            : utils.formatValue(styles, option.key)
          switch (option.component) {
            case 'select': {
              component = (
                <Select
                  style={{ width: '120px' }}
                  value={option.dataSource?.find(item => item.key === value)?.text ?? '--'}
                  dataSource={option.dataSource}
                  onSelected={(data) => {
                    const newValue = (data as SelectDataSourceItem).key
                    update(option, newValue)
                  }}/>
              )
              break
            }
            case 'switch': {
              const open = !!value
              component = (
                <Switch
                  open={open}
                  onChange={() => {
                    const newValue = !open
                    update(option, newValue)
                  }}/>
              )
              break
            }
          }
          return (
            <Fragment key={option.key}>
              <span>{option.text}</span>
              {component}
            </Fragment>
          )
        })}
      </div> 
    </Modal>
  )
}

export default SettingModal
