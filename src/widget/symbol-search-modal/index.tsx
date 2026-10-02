import { useEffect, useState } from 'react'

import { type Component } from '@/react-shared'

import { Modal, List, Input } from '@/component'

import i18n from '@/i18n'

import { type SymbolInfo } from '@/types'

export interface SymbolSearchModalProps {
  locale: string
  searchSymbols: (query?: string) => Promise<SymbolInfo[]>
  onSymbolSelected: (symbol: SymbolInfo) => void
  onClose: () => void
}

const SymbolSearchModal: Component<SymbolSearchModalProps> = props => {
  const [value, setValue] = useState('')
  const [symbolList, setSymbolList] = useState<SymbolInfo[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    void props.searchSymbols(value)
      .then((list) => {
        if (!cancelled) {
          setSymbolList(list)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSymbolList([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [value, props.searchSymbols])

  return (
    <Modal
      title={i18n('symbol_search', props.locale)}
      width={460}
      onClose={props.onClose}>
      <Input
        className="astroneum-symbol-search-modal-input"
        placeholder={i18n('symbol_code', props.locale)}
        suffix={
          <svg viewBox="0 0 1024 1024">
            <path d="M945.07 898.13l-189.87-189.87c55.47-64 87.47-149.33 87.47-241.07 0-204.8-168.53-373.33-373.33-373.33S96 264.53 96 469.33 264.53 842.67 469.33 842.67c91.73 0 174.93-34.13 241.07-87.47l189.87 189.87c6.4 6.4 14.93 8.53 23.47 8.53s17.07-2.13 23.47-8.53c8.53-12.8 8.53-34.13-2.13-46.93zM469.33 778.67C298.67 778.67 160 640 160 469.33S298.67 160 469.33 160 778.67 298.67 778.67 469.33 640 778.67 469.33 778.67z"/>
          </svg>
        }
        value={value}
        onChange={v => {
          const va = `${v}`
          setValue(va)
        }}/>
      <List
        className="astroneum-symbol-search-modal-list"
        loading={loading}
        dataSource={symbolList}
        renderItem={(symbol: SymbolInfo) => (
          <li
            key={symbol.ticker}
            role="option"
            tabIndex={0}
            aria-label={`${symbol.shortName ?? symbol.ticker}${symbol.name ? ` (${symbol.name})` : ''}`}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                props.onSymbolSelected(symbol)
                props.onClose()
              }
            }}
            onClick={() => {
              props.onSymbolSelected(symbol)
              props.onClose()
            }}>
            <div>
              {symbol.logo && <img alt="symbol" src={symbol.logo}/>}
              <span title={symbol.name ?? ''}>{symbol.shortName ?? symbol.ticker}{`${symbol.name ? `(${symbol.name})` : ''}`}</span>
            </div>
            {symbol.exchange ?? ''}
          </li>
        )}>
      </List>
    </Modal>
  )
}

export default SymbolSearchModal
