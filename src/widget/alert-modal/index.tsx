import { useMemo, useState } from 'react'

import { type Component } from '@/react-shared'

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
      <div className="astroneum-alert-modal">
        {/* Tabs */}
        <div className="astroneum-alert-modal-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'create'}
            className={`tab-btn ${tab === 'create' ? 'active' : ''}`}
            onClick={() => setTab('create')}>
            {i18n('alert_create', props.locale)}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'history'}
            className={`tab-btn ${tab === 'history' ? 'active' : ''}`}
            onClick={() => setTab('history')}>
            {i18n('alert_history', props.locale)} ({historyAlerts.length})
          </button>
        </div>

        {tab === 'create' && (
          <>
          {/* Create form */}
          <div className="astroneum-alert-modal-form">
            <label className="alert-field-label">{i18n('alert_condition', props.locale)}</label>
            <div className="alert-condition-row" role="group" aria-label="Alert condition">
              {CONDITIONS.map(c => (
                <button
                  key={c}
                  className={`alert-cond-btn ${condition === c ? 'active' : ''}`}
                  role="radio"
                  aria-checked={condition === c}
                  onClick={() => setCondition(c)}>
                  {conditionLabel(c, props.locale)}
                </button>
              ))}
            </div>

            <label className="alert-field-label">{i18n('alert_price', props.locale)}</label>
            <Input
              className="alert-price-input"
              precision={8}
              min={0}
              placeholder={String(props.currentPrice ?? 0)}
              value={price}
              onChange={v => setPrice(String(v))}/>

            <label className="alert-field-label">{i18n('alert_note', props.locale)}</label>
            <Input
              className="alert-note-input"
              placeholder={i18n('alert_note_placeholder', props.locale)}
              value={note}
              onChange={v => setNote(String(v))}/>

            <button
              className="astroneum-button button is-small is-primary alert-submit-btn"
              disabled={!isFinite(parseFloat(price))}
              onClick={addAlert}
              aria-label={i18n('alert_add', props.locale)}>
              {i18n('alert_add', props.locale)}
            </button>
          </div>

          {/* Active alerts list */}
          {activeAlerts.length > 0 && (
            <>
              <div className="alert-section-label">{i18n('alert_active', props.locale)} ({activeAlerts.length})</div>
              <List className="astroneum-alert-modal-list">
                {activeAlerts.map(alert => (
                  <li key={alert.id} className="alert-list-row">
                    <span className={`alert-cond-badge alert-cond-${alert.condition}`}>
                      {conditionLabel(alert.condition, props.locale)}
                    </span>
                    <span className="alert-price">{alert.price}</span>
                    {alert.note && <span className="alert-note">{alert.note}</span>}
                    <button
                      className="alert-delete-btn"
                      aria-label="Delete alert"
                      onClick={() => deleteAlert(alert.id)}>
                      ×
                    </button>
                  </li>
                ))}
              </List>
            </>
          )}
          </>
        )}

        {tab === 'history' && (
          historyAlerts.length > 0
            ? (
              <List className="astroneum-alert-modal-list">
                {historyAlerts.map(alert => (
                  <li key={alert.id} className="alert-list-row alert-list-row--history">
                    <span className={`alert-status-badge alert-status-${alert.status}`}>
                      {alert.status}
                    </span>
                    <span className={`alert-cond-badge alert-cond-${alert.condition}`}>
                      {conditionLabel(alert.condition, props.locale)}
                    </span>
                    <span className="alert-price">{alert.price}</span>
                    {alert.note && <span className="alert-note">{alert.note}</span>}
                    {alert.triggeredAt && (
                      <span className="alert-time">{new Date(alert.triggeredAt).toLocaleString(props.locale)}</span>
                    )}
                    <button
                      className="alert-reactivate-btn"
                      aria-label="Re-activate alert"
                      onClick={() => reactivateAlert(alert.id)}
                      title={i18n('alert_reactivate', props.locale)}>
                      ↺
                    </button>
                    <button
                      className="alert-delete-btn"
                      aria-label="Delete alert"
                      onClick={() => deleteAlert(alert.id)}>
                      ×
                    </button>
                  </li>
                ))}
              </List>
            )
            : <div className="alert-empty">{i18n('alert_no_history', props.locale)}</div>
        )}
      </div>
    </Modal>
  )
}

export default AlertModal
