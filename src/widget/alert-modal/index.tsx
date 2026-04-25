import { useMemo, useState } from 'react'

import { type Component, For, Show } from '@/react-shared'

import { Modal, Input, List } from '@/component'
import i18n from '@/i18n'
import AlertManager, { type Alert, type AlertCondition, type AlertCreate } from '@/chart/AlertManager'

export interface AlertModalProps {
  locale: string
  symbol: string
  currentPrice?: number
  onClose: () => void
}

const CONDITIONS: AlertCondition[] = ['above', 'below', 'crosses_above', 'crosses_below']

function conditionLabel (c: AlertCondition, locale: string): string {
  return i18n(`alert_${c}`, locale)
}

const AlertModal: Component<AlertModalProps> = props => {
  const manager = AlertManager.getInstance()

  const [alerts, setAlerts] = useState<Alert[]>(manager.getForSymbol(props.symbol))
  const [price, setPrice] = useState(String(props.currentPrice ?? ''))
  const [condition, setCondition] = useState<AlertCondition>('above')
  const [note, setNote] = useState('')
  const [tab, setTab] = useState<'create' | 'history'>('create')

  const refresh = (): void => { setAlerts(manager.getForSymbol(props.symbol)) }

  const activeAlerts = useMemo(() => alerts.filter(a => a.status === 'active'), [alerts])
  const historyAlerts = useMemo(() => alerts.filter(a => a.status !== 'active'), [alerts])

  function addAlert (): void {
    const p = parseFloat(price)
    if (!isFinite(p)) return
    const create: AlertCreate = {
      symbol: props.symbol,
      condition,
      price: p,
      note: note || undefined,
      frequency: 'once',
      soundEnabled: true,
      notificationEnabled: false
    }
    manager.add(create)
    setNote('')
    setPrice('')
    refresh()
  }

  function deleteAlert (id: string): void {
    manager.delete(id)
    refresh()
  }

  function reactivateAlert (id: string): void {
    manager.reactivate(id)
    refresh()
  }

  return (
    <Modal
      title={i18n('alerts', props.locale)}
      width={420}
      onClose={props.onClose}>
      <div class="astroneum-alert-modal">
        {/* Tabs */}
        <div class="astroneum-alert-modal-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'create'}
            class={`tab-btn ${tab === 'create' ? 'active' : ''}`}
            onClick={() => setTab('create')}>
            {i18n('alert_create', props.locale)}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'history'}
            class={`tab-btn ${tab === 'history' ? 'active' : ''}`}
            onClick={() => setTab('history')}>
            {i18n('alert_history', props.locale)} ({historyAlerts.length})
          </button>
        </div>

        <Show when={tab === 'create'}>
          {/* Create form */}
          <div class="astroneum-alert-modal-form">
            <label class="alert-field-label">{i18n('alert_condition', props.locale)}</label>
            <div class="alert-condition-row" role="group" aria-label="Alert condition">
              <For each={CONDITIONS}>
                {c => (
                  <button
                    class={`alert-cond-btn ${condition === c ? 'active' : ''}`}
                    role="radio"
                    aria-checked={condition === c}
                    onClick={() => setCondition(c)}>
                    {conditionLabel(c, props.locale)}
                  </button>
                )}
              </For>
            </div>

            <label class="alert-field-label">{i18n('alert_price', props.locale)}</label>
            <Input
              class="alert-price-input"
              precision={8}
              min={0}
              placeholder={String(props.currentPrice ?? 0)}
              value={price}
              onChange={v => setPrice(String(v))}/>

            <label class="alert-field-label">{i18n('alert_note', props.locale)}</label>
            <Input
              class="alert-note-input"
              placeholder={i18n('alert_note_placeholder', props.locale)}
              value={note}
              onChange={v => setNote(String(v))}/>

            <button
              class="astroneum-button button is-small is-primary alert-submit-btn"
              disabled={!isFinite(parseFloat(price))}
              onClick={addAlert}
              aria-label={i18n('alert_add', props.locale)}>
              {i18n('alert_add', props.locale)}
            </button>
          </div>

          {/* Active alerts list */}
          <Show when={activeAlerts.length > 0}>
            <div class="alert-section-label">{i18n('alert_active', props.locale)} ({activeAlerts.length})</div>
            <List class="astroneum-alert-modal-list">
              <For each={activeAlerts}>
                {alert => (
                  <li class="alert-list-row">
                    <span class={`alert-cond-badge alert-cond-${alert.condition}`}>
                      {conditionLabel(alert.condition, props.locale)}
                    </span>
                    <span class="alert-price">{alert.price}</span>
                    <Show when={alert.note}>
                      <span class="alert-note">{alert.note}</span>
                    </Show>
                    <button
                      class="alert-delete-btn"
                      aria-label="Delete alert"
                      onClick={() => deleteAlert(alert.id)}>
                      ×
                    </button>
                  </li>
                )}
              </For>
            </List>
          </Show>
        </Show>

        <Show when={tab === 'history'}>
          <Show
            when={historyAlerts.length > 0}
            fallback={<div class="alert-empty">{i18n('alert_no_history', props.locale)}</div>}>
            <List class="astroneum-alert-modal-list">
              <For each={historyAlerts}>
                {alert => (
                  <li class="alert-list-row alert-list-row--history">
                    <span class={`alert-status-badge alert-status-${alert.status}`}>
                      {alert.status}
                    </span>
                    <span class={`alert-cond-badge alert-cond-${alert.condition}`}>
                      {conditionLabel(alert.condition, props.locale)}
                    </span>
                    <span class="alert-price">{alert.price}</span>
                    <Show when={alert.note}>
                      <span class="alert-note">{alert.note}</span>
                    </Show>
                    <Show when={alert.triggeredAt}>
                      <span class="alert-time">{new Date(alert.triggeredAt!).toLocaleString(props.locale)}</span>
                    </Show>
                    <button
                      class="alert-reactivate-btn"
                      aria-label="Re-activate alert"
                      onClick={() => reactivateAlert(alert.id)}
                      title={i18n('alert_reactivate', props.locale)}>
                      ↺
                    </button>
                    <button
                      class="alert-delete-btn"
                      aria-label="Delete alert"
                      onClick={() => deleteAlert(alert.id)}>
                      ×
                    </button>
                  </li>
                )}
              </For>
            </List>
          </Show>
        </Show>
      </div>
    </Modal>
  )
}

export default AlertModal
