/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-namespace */

import type * as React from 'react'

export { Fragment, jsx, jsxs } from 'react/jsx-runtime'

export namespace JSX {
	export type Element = React.ReactNode
	export type ElementType = React.ElementType
	export interface ElementClass {
		render: any
	}
	export interface ElementAttributesProperty {
		props: any
	}
	export interface ElementChildrenAttribute {
		children: any
	}
	export interface IntrinsicAttributes {
		key?: React.Key
		[key: string]: any
	}
	export interface CompatIntrinsicAttributes extends IntrinsicAttributes {
		ref?: (el: any) => any
		onClick?: (event: any) => any
		onInput?: (event: any) => any
		onChange?: (event: any) => any
		onBlur?: (event: any) => any
		onKeyDown?: (event: any) => any
		onDblClick?: (event: any) => any
	}
	export interface IntrinsicElements {
		[elemName: string]: CompatIntrinsicAttributes
	}
}
