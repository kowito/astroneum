/* eslint-disable @typescript-eslint/no-namespace */

import React, { Fragment, type ReactNode } from 'react'

export namespace JSX {
  export type Element = React.ReactNode
  export type CSSProperties = React.CSSProperties & Record<string, string | number | undefined>
}

export type ParentProps = { children?: ReactNode }
export type Component<P = Record<string, never>> = (props: P) => JSX.Element
export type ParentComponent<P = Record<string, never>> = (props: P & ParentProps) => JSX.Element
export type VoidComponent<P = Record<string, never>> = (props: P) => JSX.Element

export function mergeProps<T extends object, U extends object>(defaults: T, props: U): T & U {
  return { ...defaults, ...props }
}

export function Show<T>(props: {
  when: T | null | undefined | false
  fallback?: ReactNode
  keyed?: boolean
  children: ReactNode | ((value: NonNullable<T>) => ReactNode)
}): React.ReactElement {
  const value = props.when
  if (!value) {
    return React.createElement(Fragment, null, props.fallback ?? null)
  }

  if (typeof props.children === 'function') {
    const rendered = props.children(value)
    return React.createElement(Fragment, null, rendered)
  }

  return React.createElement(Fragment, null, props.children)
}

export function For<T>(props: {
  each?: readonly T[] | null
  children: (value: T, index: () => number) => ReactNode
}): React.ReactElement {
  const list = props.each ?? []

  const resolveKey = (value: T, index: number): React.Key => {
    if (typeof value === 'string' || typeof value === 'number') {
      return value
    }
    if (typeof value === 'object' && value !== null) {
      const candidate = (value as { key?: unknown; id?: unknown }).key ?? (value as { id?: unknown }).id
      if (typeof candidate === 'string' || typeof candidate === 'number') {
        return candidate
      }
    }
    return index
  }

  return React.createElement(
    Fragment,
    null,
    ...list.map((value, index) => (
      React.createElement(Fragment, { key: resolveKey(value, index) }, props.children(value, () => index))
    ))
  )
}
