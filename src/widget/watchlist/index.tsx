import React, { useEffect, useState } from 'react'

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
    <div className="astroneum-watchlist" role="region" aria-label={i18n('watchlist', props.locale)}>
      <div className="watchlist-header">
        <span className="watchlist-title">{i18n('watchlist', props.locale)}</span>
        <button className="watchlist-add-list-btn" onClick={addList} title={i18n('watchlist_add_list', props.locale)} aria-label={i18n('watchlist_add_list', props.locale)}>+</button>
      </div>

      {lists.map(list => (
        <div key={list.id} className="watchlist-group">
          <div className="watchlist-group-header" onClick={() => { toggleList(list.id) }}>
            <span className={`watchlist-arrow ${expandedId === list.id ? 'expanded' : ''}`}>▶</span>
            {editing !== list.id
              ? (
                <span className="watchlist-group-name" onDoubleClick={(e: React.MouseEvent) => { e.stopPropagation(); startRename(list) }}>
                  {list.name}
                </span>
              )
              : (
                <input
                  className="watchlist-rename-input"
                  value={editValue}
                  onInput={e => { setEditValue((e.target).value) }}
                  onBlur={() => { commitRename(list.id) }}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(list.id) }}
                  onClick={e => { e.stopPropagation() }}
                  autoFocus
                />
              )
            }
            <button
              className="watchlist-delete-list-btn"
              onClick={e => { e.stopPropagation(); manager.deleteList(list.id) }}
              title={i18n('watchlist_delete_list', props.locale)}
              aria-label={i18n('watchlist_delete_list', props.locale)}>✕</button>
          </div>

          {expandedId === list.id && (
            <div className="watchlist-symbols">
              {list.symbols.map(symbol => (
                <div key={symbol.ticker} className="watchlist-symbol-row" onClick={() => { props.onSymbolSelect?.(symbol.ticker) }}>
                  <span className="watchlist-symbol-ticker">{symbol.ticker}</span>
                  <span className="watchlist-symbol-name">{symbol.name ?? ''}</span>
                  <button
                    className="watchlist-remove-symbol-btn"
                    onClick={e => { e.stopPropagation(); manager.removeSymbol(list.id, symbol.ticker) }}
                    title={i18n('watchlist_remove_symbol', props.locale)}
                    aria-label={i18n('watchlist_remove_symbol', props.locale)}>✕</button>
                </div>
              ))}

              <div className="watchlist-add-symbol">
                <input
                  className="watchlist-add-symbol-input"
                  placeholder={i18n('watchlist_enter_symbol', props.locale)}
                  value={addSymbolValue}
                  onInput={e => { setAddSymbolValue((e.target).value) }}
                  onKeyDown={e => { if (e.key === 'Enter') addSymbol(list.id) }}
                />
                <button className="watchlist-add-symbol-btn" onClick={() => { addSymbol(list.id) }}>
                  {i18n('watchlist_add_symbol', props.locale)}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export { WatchlistPanel as WatchlistWidget }
export default WatchlistPanel
