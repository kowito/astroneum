import { type Component } from '@/react-shared'

import { Modal, List, Checkbox } from '@/component'

import i18n from '@/i18n'
import type { IndicatorDef } from '@/types'

type OnIndicatorChange = (
  params: {
    name: string
    paneId: string
    added: boolean
  }
) => void

export interface IndicatorModalProps {
  locale: string
  mainIndicators: IndicatorDef[]
  subIndicators: Record<string, string>
  onMainIndicatorChange: OnIndicatorChange
  onSubIndicatorChange: OnIndicatorChange
  onClose: () => void
}

const IndicatorModal: Component<IndicatorModalProps> = props => {

  return (
    <Modal
      title={i18n('indicator', props.locale)}
      width={400}
      onClose={props.onClose}>
      <List
        className="astroneum-indicator-modal-list">
        <li className="title">{i18n('main_indicator', props.locale)}</li>
        {
          [
            'MA', 'EMA', 'SMA', 'BOLL', 'SAR', 'BBI'
          ].map(name => {
            const checked = props.mainIndicators.some(i => i.name === name)
            return (
              <li
                className="row"                role="checkbox"
                aria-checked={checked}
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onMainIndicatorChange({ name, paneId: 'candle_pane', added: !checked }) } }}                onClick={_ => {
                  props.onMainIndicatorChange({ name, paneId: 'candle_pane', added: !checked })
                }}>
                <Checkbox checked={checked} label={i18n(name.toLowerCase(), props.locale)}/>
              </li>
            )
          })
        }
        <li className="title">{i18n('sub_indicator', props.locale)}</li>
        {
          [
            'MA', 'EMA', 'VOL', 'MACD', 'BOLL', 'KDJ',
            'RSI', 'BIAS', 'BRAR', 'CCI', 'DMI',
            'CR', 'PSY', 'DMA', 'TRIX', 'OBV',
            'VR', 'WR', 'MTM', 'EMV', 'SAR',
            'SMA', 'ROC', 'PVT', 'BBI', 'AO'
          ].map(name => {
            const checked = name in props.subIndicators
            return (
              <li
                className="row"
                role="checkbox"
                aria-checked={checked}
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onSubIndicatorChange({ name, paneId: props.subIndicators[name] ?? '', added: !checked }) } }}
                onClick={_ => {
                  props.onSubIndicatorChange({ name, paneId: props.subIndicators[name] ?? '', added: !checked });
                }}>
                <Checkbox checked={checked} label={i18n(name.toLowerCase(), props.locale)}/>
              </li>
            )
          })
        }
      </List>
    </Modal>
  )
}

export default IndicatorModal
