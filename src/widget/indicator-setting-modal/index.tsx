import { useState } from 'react'

import { type Component } from '@/react-shared'

import { utils } from '@/engine'

import { Modal, Input, Switch } from '@/component'

import i18n from '@/i18n'

import data from './data'
import type { IndicatorParamConfig } from './types'
import type { LineStyleEntry } from '@/store/uiStore'

export interface IndicatorSettingModalProps {
  locale: string
  params: { indicatorName: string, paneId: string, calcParams: number[], lineStyles: LineStyleEntry[] }
  onClose: () => void
  onConfirm: (calcParams: number[], lineStyles: LineStyleEntry[]) => void
}

const IndicatorSettingModal: Component<IndicatorSettingModalProps> = props => {
  const [calcParams, setCalcParams] = useState<(number | string)[]>(utils.clone(props.params.calcParams))
  const [lineStyles, setLineStyles] = useState<LineStyleEntry[]>(utils.clone(props.params.lineStyles))

  const getConfig = (name: string): IndicatorParamConfig[] => (data[name] ?? [])

  const hasLineStyles = () => props.params.lineStyles.length > 0

  return (
    <Modal
      title={props.params.indicatorName}
      width={360}
      buttons={[
        {
          type: 'confirm',
          children: i18n('confirm', props.locale),
          onClick: () => {
            const config = getConfig(props.params.indicatorName)
            const params: number[] = []
            ;(utils.clone(calcParams)).forEach((param, i) => {
              if (!utils.isValid(param) || param === '') {
                if ('default' in config[i]) {
                  params.push(config[i].default!)
                }
              } else {
                params.push(Number(param))
              }
            })
            props.onConfirm(params, lineStyles)
            props.onClose()
          }
        }
      ]}
      onClose={props.onClose}>
      <div className="astroneum-indicator-setting-modal-content">
        {hasLineStyles() && (
          <div className="astroneum-indicator-setting-modal-header">
            <span>{i18n('period', props.locale)}</span>
            <span>{i18n('color', props.locale)}</span>
            <span>{i18n('show', props.locale)}</span>
          </div>
        )}
        {getConfig(props.params.indicatorName).map((configItem, configIndex) => {
          const lineStyle = hasLineStyles() ? lineStyles[configIndex] : undefined
          return (
            <div key={configIndex} className="astroneum-indicator-setting-modal-row">
              <span className="astroneum-indicator-setting-modal-label">{i18n(configItem.paramNameKey, props.locale)}</span>
              <Input
                style={{ width: hasLineStyles() ? '80px' : '200px' }}
                value={calcParams[configIndex] ?? ''}
                precision={configItem.precision}
                min={configItem.min}
                onChange={value => {
                  const params = utils.clone(calcParams)
                  params[configIndex] = value
                  setCalcParams(params)
                }}/>
              {lineStyle && (
                <>
                  <input
                    type="color"
                    className="astroneum-indicator-setting-modal-color"
                    value={lineStyle.color}
                    onInput={inputEvent => {
                      const next = utils.clone(lineStyles)
                      const nextLineStyle = next[configIndex]
                      if (!nextLineStyle) {
                        return
                      }
                      nextLineStyle.color = inputEvent.currentTarget.value
                      setLineStyles(next)
                    }}/>
                  <Switch
                    open={lineStyle.show}
                    onChange={() => {
                      const next = utils.clone(lineStyles)
                      const nextLineStyle = next[configIndex]
                      if (!nextLineStyle) {
                        return
                      }
                      nextLineStyle.show = !nextLineStyle.show
                      setLineStyles(next)
                    }}/>
                </>
              )}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

export default IndicatorSettingModal
