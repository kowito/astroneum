import { useEffect, useState } from 'react'

import { For, Show } from '@/react-shared'

import i18n from '@/i18n'
import WatchlistManager, { type Watchlist } from '@/chart/WatchlistManager'

export interface WatchlistProps {
  locale: string
  /** Called when the user clicks a symbol ticker */
  onSymbolSelect?: (ticker: string) => void
}

const WatchlistPanel = (props: WatchlistProps) => {
  const manager = WatchlistManager.getInstance()
  const [lists, setLists] = useState<Watchlist[]>(manager.getLists())
  const [expandedId, setExpandedId] = useState<string>(manager.getLists()[0]?.id ?? '')
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [addSymbolValue, setAddSymbolValue] = useState('')

  useEffect(() => {
    const unsub = manager.onChange(updated => { setLists([...updated]) })
    return unsub
  }, [manager])

  function toggleList (id: string): void {
    setExpandedId(prev => prev === id ? '' : id)
  }

  function addList (): void {
    const list = manager.createList(i18n('watchlist_new', props.locale))
    setExpandedId(list.id)
  }

  function startRename (list: Watchlist): void {
    setEditing(list.id)
    setEditValue(list.name)
  }

  function commitRename (id: string): void {
    manager.renameList(id, editValue)
    setEditing(null)
  }

  function addSymbol (listId: string): void {
    const ticker = addSymbolValue.trim().toUpperCase()
    if (!ticker) return
    manager.addSymbol(listId, { ticker })
    setAddSymbolValue('')
  }

  return (
    <div class="astroneum-watchlist" role="region" aria-label={i18n('watchlist', props.locale)}>
      <div class="watchlist-header">
        <span class="watchlist-title">{i18n('watchlist', props.locale)}</span>
        <button class="watchlist-add-list-btn" onClick={addList} title={i18n('watchlist_add_list', props.locale)} aria-label={i18n('watchlist_add_list', props.locale)}>+</button>
      </div>

      <For each={lists}>
        {list => (
          <div class="watchlist-group">
            <div class="watchlist-group-header" onClick={() => { toggleList(list.id) }}>
              <span class={`watchlist-arrow ${expandedId === list.id ? 'expanded' : ''}`}>▶</span>
              <Show
                when={editing !== list.id}
                fallback={
                  <input
                    class="watchlist-rename-input"
                    value={editValue}
                    onInput={e => { setEditValue((e.target).value) }}
                    onBlur={() => { commitRename(list.id) }}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(list.id) }}
                    onClick={e => { e.stopPropagation() }}
                    autofocus
                  />
                }>
                <span class="watchlist-group-name" onDblClick={e => { e.stopPropagation(); startRename(list) }}>
                  {list.name}
                </span>
              </Show>
              <button
                class="watchlist-delete-list-btn"
                onClick={e => { e.stopPropagation(); manager.deleteList(list.id) }}
                title={i18n('watchlist_delete_list', props.locale)}
                aria-label={i18n('watchlist_delete_list', props.locale)}>✕</button>
            </div>

            <Show when={expandedId === list.id}>
              <div class="watchlist-symbols">
                <For each={list.symbols}>
                  {(symbol, _index) => (
                    <div class="watchlist-symbol-row" onClick={() => { props.onSymbolSelect?.(symbol.ticker) }}>
                      <span class="watchlist-symbol-ticker">{symbol.ticker}</span>
                      <span class="watchlist-symbol-name">{symbol.name ?? ''}</span>
                      <button
                        class="watchlist-remove-symbol-btn"
                        onClick={e => { e.stopPropagation(); manager.removeSymbol(list.id, symbol.ticker) }}
                        title={i18n('watchlist_remove_symbol', props.locale)}
                        aria-label={i18n('watchlist_remove_symbol', props.locale)}>✕</button>
                    </div>
                  )}
                </For>

                <div class="watchlist-add-symbol">
                  <input
                    class="watchlist-add-symbol-input"
                    placeholder={i18n('watchlist_enter_symbol', props.locale)}
                    value={addSymbolValue}
                    onInput={e => { setAddSymbolValue((e.target).value) }}
                    onKeyDown={e => { if (e.key === 'Enter') addSymbol(list.id) }}
                  />
                  <button class="watchlist-add-symbol-btn" onClick={() => { addSymbol(list.id) }}>
                    {i18n('watchlist_add_symbol', props.locale)}
                  </button>
                </div>
              </div>
            </Show>
          </div>
        )}
      </For>
    </div>
  )
}

export { WatchlistPanel as WatchlistWidget }
export default WatchlistPanel
