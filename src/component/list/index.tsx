import { type ParentComponent, type ParentProps, type JSX } from '@/react-shared'

import Loading from '../loading'
import Empty from '../empty'

export interface ListProps<T = unknown> extends ParentProps {
  className?: string
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
      className={`astroneum-list ${props.className ?? ''}`}>
      {props.loading && <Loading/>}
      {!props.loading && !props.children && !props.dataSource?.length && <Empty/>}
      {props.children}
      {!props.children && props.dataSource?.map(data => props.renderItem?.(data) ?? <li></li>)}
    </ul>
  )
}

export default List
