/**
 * Client-side price / indicator alerts engine.
 *
 * Alerts are persisted to localStorage and evaluated on every new bar
 * or price tick via `AlertManager.check()`.
 *
 * Usage:
 *   const alerts = AlertManager.getInstance()
 *   alerts.add({ symbol: 'AAPL', condition: 'above', price: 200, note: 'ATH break' })
 *   // In your datafeed tick handler:
 *   alerts.check({ symbol: 'AAPL', price: latestPrice, timestamp: Date.now() })
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertCondition = 'above' | 'below' | 'crosses_above' | 'crosses_below'
export type AlertStatus = 'active' | 'triggered' | 'dismissed'
export type AlertFrequency = 'once' | 'every_bar'

export interface Alert {
  /** Unique identifier (auto-generated) */
  id: string
  /** Symbol ticker this alert watches */
  symbol: string
  /** Trigger condition */
  condition: AlertCondition
  /** Price level threshold */
  price: number
  /** Optional user note / label */
  note?: string
  /** How many times to fire: 'once' disables after first trigger */
  frequency: AlertFrequency
  /** Current status */
  status: AlertStatus
  /** ISO timestamp when the alert was created */
  createdAt: string
  /** ISO timestamp when the alert was last triggered */
  triggeredAt?: string
  /** Sound notification enabled */
  soundEnabled: boolean
  /** Browser notification enabled */
  notificationEnabled: boolean
  /** Optional webhook URL — a POST request is sent when this alert fires */
  webhookUrl?: string
}

export type AlertCreate = Omit<Alert, 'id' | 'status' | 'createdAt' | 'triggeredAt'> & Partial<Pick<Alert, 'frequency' | 'soundEnabled' | 'notificationEnabled'>>

export interface AlertCheckInput {
  symbol: string
  price: number
  timestamp: number
}

export type AlertTriggeredCallback = (alert: Alert, price: number) => void

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'astroneum-alerts'

function loadFromStorage (): Alert[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Alert[]) : []
  } catch {
    return []
  }
}

function saveToStorage (alerts: Alert[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts))
  } catch {
    // storage quota exceeded — silently ignore
  }
}

// ---------------------------------------------------------------------------
// AudioContext beep (no external asset needed)
// ---------------------------------------------------------------------------

function playBeep (): void {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.4)
    osc.onended = () => { void ctx.close() }
  } catch {
    // AudioContext not available (e.g. SSR)
  }
}

// ---------------------------------------------------------------------------
// AlertManager singleton
// ---------------------------------------------------------------------------

export class AlertManager {
  private static _instance: AlertManager | null = null

  private _alerts: Alert[]
  /** Last known price per symbol — used for crosses_above/crosses_below */
  private _lastPrice: Map<string, number> = new Map()
  private _listeners: AlertTriggeredCallback[] = []

  private constructor () {
    this._alerts = loadFromStorage()
  }

  static getInstance (): AlertManager {
    if (!AlertManager._instance) {
      AlertManager._instance = new AlertManager()
    }
    return AlertManager._instance
  }

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  /** Add a new alert and return its id. */
  add (create: AlertCreate): string {
    const alert: Alert = {
      ...create,
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      status: 'active',
      createdAt: new Date().toISOString(),
      frequency: create.frequency ?? 'once',
      soundEnabled: create.soundEnabled ?? true,
      notificationEnabled: create.notificationEnabled ?? false
    }
    this._alerts.push(alert)
    saveToStorage(this._alerts)
    return alert.id
  }

  /** Update an existing alert by id. Returns false if not found. */
  update (id: string, patch: Partial<Omit<Alert, 'id' | 'createdAt'>>): boolean {
    const idx = this._alerts.findIndex(a => a.id === id)
    if (idx === -1) return false
    this._alerts[idx] = { ...this._alerts[idx], ...patch }
    saveToStorage(this._alerts)
    return true
  }

  /** Delete an alert. Returns false if not found. */
  delete (id: string): boolean {
    const prev = this._alerts.length
    this._alerts = this._alerts.filter(a => a.id !== id)
    if (this._alerts.length !== prev) {
      saveToStorage(this._alerts)
      return true
    }
    return false
  }

  /** Dismiss a triggered alert (keeps it in history with status='dismissed'). */
  dismiss (id: string): boolean {
    return this.update(id, { status: 'dismissed' })
  }

  /** Re-activate a previously triggered/dismissed alert. */
  reactivate (id: string): boolean {
    return this.update(id, { status: 'active', triggeredAt: undefined })
  }

  /** Delete all alerts for a symbol (or all if no symbol given). */
  clear (symbol?: string): void {
    this._alerts = symbol ? this._alerts.filter(a => a.symbol !== symbol) : []
    saveToStorage(this._alerts)
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  getAll (): readonly Alert[] { return this._alerts }
  getActive (): Alert[] { return this._alerts.filter(a => a.status === 'active') }
  getForSymbol (symbol: string): Alert[] { return this._alerts.filter(a => a.symbol === symbol) }
  getActiveForSymbol (symbol: string): Alert[] { return this._alerts.filter(a => a.symbol === symbol && a.status === 'active') }
  getHistory (): Alert[] { return this._alerts.filter(a => a.status !== 'active') }

  // -------------------------------------------------------------------------
  // Evaluation
  // -------------------------------------------------------------------------

  /**
   * Call this on every price tick or bar close.
   * Fires registered callbacks for any triggered alerts.
   */
  check (input: AlertCheckInput): void {
    const { symbol, price, timestamp } = input
    const last = this._lastPrice.get(symbol)
    this._lastPrice.set(symbol, price)

    for (const alert of this._alerts) {
      if (alert.symbol !== symbol || alert.status !== 'active') continue

      let triggered = false

      switch (alert.condition) {
        case 'above':
          triggered = price >= alert.price
          break
        case 'below':
          triggered = price <= alert.price
          break
        case 'crosses_above':
          triggered = last !== undefined && last < alert.price && price >= alert.price
          break
        case 'crosses_below':
          triggered = last !== undefined && last > alert.price && price <= alert.price
          break
      }

      if (!triggered) continue

      const triggeredAt = new Date(timestamp).toISOString()
      alert.triggeredAt = triggeredAt
      if (alert.frequency === 'once') {
        alert.status = 'triggered'
      }

      this._fire(alert, price)
    }

    saveToStorage(this._alerts)
  }

  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------

  private _fire (alert: Alert, price: number): void {
    // Audio
    if (alert.soundEnabled) { playBeep() }

    // Browser notification
    if (alert.notificationEnabled && 'Notification' in window) {
      const label = alert.note ?? `${alert.symbol} ${alert.condition} ${alert.price}`
      if (Notification.permission === 'granted') {
        new Notification(`Alert: ${label}`, {
          body: `Current price: ${price}`,
          icon: '/favicon.ico'
        })
      } else if (Notification.permission !== 'denied') {
        void Notification.requestPermission().then(perm => {
          if (perm === 'granted') {
            new Notification(`Alert: ${label}`, { body: `Current price: ${price}` })
          }
        })
      }
    }

    // Webhook
    if (alert.webhookUrl) {
      const payload = {
        id: alert.id,
        symbol: alert.symbol,
        condition: alert.condition,
        price: alert.price,
        triggeredPrice: price,
        triggeredAt: alert.triggeredAt,
        note: alert.note
      }
      fetch(alert.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => { /* best-effort delivery */ })
    }

    // Registered callbacks
    for (const cb of this._listeners) {
      try { cb(alert, price) } catch { /* ignore listener errors */ }
    }
  }

  /** Register a callback invoked whenever an alert triggers. */
  onTriggered (cb: AlertTriggeredCallback): () => void {
    this._listeners.push(cb)
    return () => { this._listeners = this._listeners.filter(l => l !== cb) }
  }

  /** Request browser notification permission proactively. */
  async requestNotificationPermission (): Promise<NotificationPermission> {
    if (!('Notification' in window)) return 'denied'
    if (Notification.permission !== 'default') return Notification.permission
    return Notification.requestPermission()
  }
}

export default AlertManager
