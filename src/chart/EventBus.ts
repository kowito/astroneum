/**
 * EventBus — type-safe, zero-dependency synchronous event bus.
 *
 * Usage:
 *   const bus = new EventBus<ChartEventMap>()
 *   const off = bus.on('tick', candle => chart.update(candle))
 *   bus.emit('tick', newCandle)
 *   off()  // unsubscribe
 *
 * Performance characteristics:
 *   - O(n_listeners) per emit — keep listener count low in hot paths
 *   - All events are synchronous and ordered (FIFO within an event key)
 *   - No allocations on emit when there are no listeners for the key
 */

type ListenerOf<TMap, K extends keyof TMap> = (payload: TMap[K]) => void
type AnyListener<TMap> = (payload: TMap[keyof TMap]) => void

export class EventBus<TMap extends Record<string, unknown>> {
  private readonly _listeners = new Map<keyof TMap, Set<AnyListener<TMap>>>()

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   * The returned function is idempotent — safe to call multiple times.
   */
  on<K extends keyof TMap>(event: K, listener: ListenerOf<TMap, K>): () => void {
    let set = this._listeners.get(event)
    if (!set) {
      set = new Set()
      this._listeners.set(event, set)
    }
    set.add(listener as AnyListener<TMap>)
    return (): void => { this.off(event, listener) }
  }

  /** Unsubscribe a specific listener. No-op if not currently subscribed. */
  off<K extends keyof TMap>(event: K, listener: ListenerOf<TMap, K>): void {
    this._listeners.get(event)?.delete(listener as AnyListener<TMap>)
  }

  /** Emit an event, invoking all registered listeners synchronously. */
  emit<K extends keyof TMap>(event: K, payload: TMap[K]): void {
    this._listeners.get(event)?.forEach(fn => { fn(payload) })
  }

  /**
   * Clear all listeners for a specific event, or all listeners when called
   * with no argument (useful for component teardown).
   */
  clear(event?: keyof TMap): void {
    if (event !== undefined) {
      this._listeners.get(event)?.clear()
    } else {
      this._listeners.clear()
    }
  }
}

/** Singleton chart event bus — shared across panes for crosshair sync. */
export { EventBus as default }
