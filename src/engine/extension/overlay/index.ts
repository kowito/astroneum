// @ts-nocheck

import type Nullable from '../../common/Nullable'

import OverlayImp, { type OverlayTemplate, type OverlayConstructor, type OverlayInnerConstructor } from '../../component/Overlay'

import fibonacciLine from './fibonacciLine'
import horizontalRayLine from './horizontalRayLine'
import horizontalSegment from './horizontalSegment'
import horizontalStraightLine from './horizontalStraightLine'
import parallelStraightLine from './parallelStraightLine'
import priceChannelLine from './priceChannelLine'
import priceLine from './priceLine'
import rayLine from './rayLine'
import segment from './segment'
import straightLine from './straightLine'
import verticalRayLine from './verticalRayLine'
import verticalSegment from './verticalSegment'
import verticalStraightLine from './verticalStraightLine'

import simpleAnnotation from './simpleAnnotation'
import simpleTag from './simpleTag'

const overlays: Record<string, OverlayInnerConstructor> = {}

const extensions = [
  fibonacciLine, horizontalRayLine, horizontalSegment, horizontalStraightLine,
  parallelStraightLine, priceChannelLine, priceLine, rayLine, segment,
  straightLine, verticalRayLine, verticalSegment, verticalStraightLine,
  simpleAnnotation, simpleTag
]

extensions.forEach((template: OverlayTemplate) => {
  overlays[template.name] = OverlayImp.extend(template)
})

function registerOverlay<E = unknown> (template: OverlayTemplate<E>): void {
  overlays[template.name] = OverlayImp.extend(template)
}

function getOverlayInnerClass (name: string): Nullable<OverlayInnerConstructor> {
  return overlays[name] ?? null
}

function getOverlayClass (name: string): Nullable<OverlayConstructor> {
  return overlays[name] ?? null
}

function getSupportedOverlays (): string[] {
  return Object.keys(overlays)
}

export { registerOverlay, getOverlayClass, getOverlayInnerClass, getSupportedOverlays }
