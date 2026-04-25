import { type Component } from '@/react-shared'

import {
  horizontalStraightLine, horizontalRayLine, horizontalSegment,
  verticalStraightLine, verticalRayLine, verticalSegment,
  straightLine, rayLine, segment, arrow, priceLine,
  priceChannelLine, parallelStraightLine,
  fibonacciLine, fibonacciSegment, fibonacciCircle, fibonacciSpiral,
  fibonacciSpeedResistanceFan, fibonacciExtension, gannBox, gannFan, pitchfork,
  circle, triangle, rect, parallelogram,
  threeWaves, fiveWaves, eightWaves, anyWaves,
  abcd, xabcd,
  weakMagnet, strongMagnet, noMagnet, snapLevels,
  visible, invisible,
  lock, unlock,
  remove
} from './icons'

import type { SelectDataSourceItem } from '@/component'

import i18n from '@/i18n'

export const mapping = {
  horizontalStraightLine,
  horizontalRayLine,
  horizontalSegment,
  verticalStraightLine,
  verticalRayLine,
  verticalSegment,
  straightLine,
  rayLine,
  segment,
  arrow,
  priceLine,
  priceChannelLine,
  parallelStraightLine,
  fibonacciLine,
  fibonacciSegment,
  fibonacciCircle,
  fibonacciSpiral,
  fibonacciSpeedResistanceFan,
  fibonacciExtension,
  gannBox,
  gannFan,
  pitchfork,
  circle,
  triangle,
  rect,
  parallelogram,
  threeWaves,
  fiveWaves,
  eightWaves,
  anyWaves,
  abcd,
  xabcd,
  weak_magnet: weakMagnet,
  strong_magnet: strongMagnet,
  no_magnet: noMagnet,
  snap_levels: snapLevels,
  lock,
  unlock,
  visible,
  invisible,
  remove
}

export function createSingleLineOptions (locale: string): SelectDataSourceItem[] {
  return  [
    { key: 'horizontalStraightLine', text: i18n('horizontal_straight_line', locale) },
    { key: 'horizontalRayLine', text: i18n('horizontal_ray_line', locale) },
    { key: 'horizontalSegment', text: i18n('horizontal_segment', locale) },
    { key: 'verticalStraightLine', text: i18n('vertical_straight_line', locale) },
    { key: 'verticalRayLine', text: i18n('vertical_ray_line', locale) },
    { key: 'verticalSegment', text: i18n('vertical_segment', locale) },
    { key: 'straightLine', text: i18n('straight_line', locale) },
    { key: 'rayLine', text: i18n('ray_line', locale) },
    { key: 'segment', text: i18n('segment', locale) },
    { key: 'arrow', text: i18n('arrow', locale) },
    { key: 'priceLine', text: i18n('price_line', locale) }
  ]
}

export function createMoreLineOptions (locale: string): SelectDataSourceItem[] {
  return [
    { key: 'priceChannelLine', text: i18n('price_channel_line', locale) },
    { key: 'parallelStraightLine', text: i18n('parallel_straight_line', locale) }
  ]
}

export function createPolygonOptions (locale: string): SelectDataSourceItem[] {
  return [
    { key: 'circle', text: i18n('circle', locale) },
    { key: 'rect', text: i18n('rect', locale) },
    { key: 'parallelogram', text: i18n('parallelogram', locale) },
    { key: 'triangle', text: i18n('triangle', locale) }
  ]
}

export function createFibonacciOptions (locale: string): SelectDataSourceItem[] {
  return [
    { key: 'fibonacciLine', text: i18n('fibonacci_line', locale) },
    { key: 'fibonacciSegment', text: i18n('fibonacci_segment', locale) },
    { key: 'fibonacciCircle', text: i18n('fibonacci_circle', locale) },
    { key: 'fibonacciSpiral', text: i18n('fibonacci_spiral', locale) },
    { key: 'fibonacciSpeedResistanceFan', text: i18n('fibonacci_speed_resistance_fan', locale) },
    { key: 'fibonacciExtension', text: i18n('fibonacci_extension', locale) },
    { key: 'gannBox', text: i18n('gann_box', locale) },
    { key: 'gannFan', text: i18n('gann_fan', locale) },
    { key: 'pitchfork', text: i18n('pitchfork', locale) }
  ]
}

export function createWaveOptions (locale: string): SelectDataSourceItem[] {
  return [
    { key: 'xabcd', text: i18n('xabcd', locale) },
    { key: 'abcd', text: i18n('abcd', locale) },
    { key: 'threeWaves', text: i18n('three_waves', locale) },
    { key: 'fiveWaves', text: i18n('five_waves', locale) },
    { key: 'eightWaves', text: i18n('eight_waves', locale) },
    { key: 'anyWaves', text: i18n('any_waves', locale) },
  ]
}

export function createMagnetOptions (locale: string): SelectDataSourceItem[] {
  return [
    { key: 'no_magnet',     text: i18n('no_magnet', locale) },
    { key: 'weak_magnet',   text: i18n('weak_magnet', locale) },
    { key: 'strong_magnet', text: i18n('strong_magnet', locale) }
  ]
}

interface IconProps {
  class?: string
  name: string
}

// @ts-expect-error mapping is dynamically keyed; props.name accesses it safely
export const Icon: Component<IconProps> = props => mapping[props.name](props.class)
