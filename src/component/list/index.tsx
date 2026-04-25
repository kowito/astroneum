import { type ParentComponent, type ParentProps, type JSX, Show } from '@/react-shared'

import Loading from '../loading'
import Empty from '../empty'

export interface ListProps<T = unknown> extends ParentProps {
  class?: string
  style?: JSX.CSSProperties | string
  loading?: boolean
  dataSource?: T[]
  renderItem?: (data: T) => JSX.Element
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const List: ParentComponent<ListProps<any>> = props => {
  return (
    <ul
      style={props.style}
      class={`astroneum-list ${props.class ?? ''}`}>
      <Show when={props.loading}>
        <Loading/>
      </Show>
      <Show when={!props.loading && !props.children && !props.dataSource?.length}>
        <Empty/>
      </Show>
      <Show
        when={props.children}>
        {props.children}
      </Show>
      <Show
        when={!props.children}>
        {
          props.dataSource?.map(data => (
            props.renderItem?.(data) ?? <li></li>
          ))
        }
      </Show>
    </ul>
  )
}

export default List
