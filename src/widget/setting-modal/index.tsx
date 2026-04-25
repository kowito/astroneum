import { useEffect, useState } from 'react'

import { type Component, For } from '@/react-shared'
import type { Styles, DeepPartial } from '@/types'
import { utils } from '@/engine'

import { deepSet } from '@/utils'

import { Modal, Select, Switch } from '@/component'
import type { SelectDataSourceItem } from '@/component'

import i18n from '@/i18n'
import { getOptions } from './data'

export interface SettingModalProps {
  locale: string
  currentStyles: Styles
  onClose: () => void
  onChange: (style: DeepPartial<Styles>) => void
  onRestoreDefault: (options: SelectDataSourceItem[]) => void
}

const SettingModal: Component<SettingModalProps> = props => {
  const [styles, setStyles] = useState(props.currentStyles)
  const [options, setOptions] = useState(getOptions(props.locale))

  useEffect(() => {
    setOptions(getOptions(props.locale))
  }, [props.locale])

  const update = (option: SelectDataSourceItem, newValue: unknown) => {
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
        class="astroneum-setting-modal-content">
        <For each={options}>
          {
            option => {
              let component
              const value = utils.formatValue(styles, option.key)
              switch (option.component) {
                case 'select': {
                  component = (
                    <Select
                      style={{ width: '120px' }}
                      value={i18n(value as string, props.locale)}
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
                <>
                  <span>{option.text}</span>
                  {component}
                </>
              )
            }
          }
        </For>
      </div> 
    </Modal>
  )
}

export default SettingModal
