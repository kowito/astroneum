import { useState } from 'react'

import { type Component, type JSX } from '@/react-shared'

export interface SelectDataSourceItem {
  key: string
  text: JSX.Element
}

export interface SelectProps {
  class?: string
  style?: JSX.CSSProperties | string
  value?: JSX.Element
  valueKey?: string
  dataSource?: SelectDataSourceItem[] | string[]
  onSelected?: (data: SelectDataSourceItem | string) => void
}

const Select: Component<SelectProps> = props => {
  const [open, setOpen] = useState(false)

  return (
    <div
      style={props.style}
      class={`astroneum-select ${props.class ?? ''} ${open ? 'astroneum-select-show' : ''}`}
      tabIndex="0"
      onClick={_ => { setOpen(o => !o) }}
      onBlur={_ => { setOpen(false) }}>
      <div
        class="selector-container">
        <span class="value">{props.value}</span>
        <i class="arrow"/>
      </div>
      {
        (props.dataSource && props.dataSource.length > 0) &&
        <div
          class="drop-down-container">
          <ul>
            {
              props.dataSource.map(data => {
                const selectedItem = data as SelectDataSourceItem
                // @ts-expect-error dynamic key access on SelectDataSourceItem
                const displayValue = selectedItem[props.valueKey ?? 'text'] ?? data
                return (
                  <li
                    onClick={clickEvent => {
                      clickEvent.stopPropagation()
                      if (props.value !== displayValue) {
                        props.onSelected?.(data)
                      }
                      setOpen(false)
                    }}>
                    {displayValue}
                  </li>
                )
              })
            }
          </ul>
        </div>
      }
    </div>
  )
}

export default Select
