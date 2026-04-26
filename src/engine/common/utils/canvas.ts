import type Nullable from '../Nullable'
import { isValid } from './typeChecks'

let measureCtx: Nullable<CanvasRenderingContext2D> = null

/**
 * Get pixel ratio
 * @param canvas
 * @returns {number}
 */
export function getPixelRatio (canvas: HTMLCanvasElement): number {
  return canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1
}

const _fontCache = new Map<string, string>()

export function createFont (size?: number, weight?: string | number, family?: string): string {
  const key = `${size ?? 12}:${weight ?? 'normal'}:${family ?? 'Helvetica Neue'}`
  let font = _fontCache.get(key)
  if (font === undefined) {
    font = `${weight ?? 'normal'} ${size ?? 12}px ${family ?? 'Helvetica Neue'}`
    _fontCache.set(key, font)
  }
  return font
}

/**
 * Measure the width of text
 * @param text
 * @returns {number}
 */
export function calcTextWidth (text: string, size?: number, weight?: string | number, family?: string): number {
  if (!isValid(measureCtx)) {
    const canvas = document.createElement('canvas')
    const pixelRatio = getPixelRatio(canvas)
    measureCtx = canvas.getContext('2d')!
    measureCtx.scale(pixelRatio, pixelRatio)
  }
  measureCtx.font = createFont(size, weight, family)
  return Math.round(measureCtx.measureText(text).width)
}

const _textWidthCache = new Map<string, number>()

/**
 * Measure text width using ctx's current font, caching the result.
 * Key: current ctx.font + '\0' + text
 */
export function cachedTextWidth (ctx: CanvasRenderingContext2D, text: string): number {
  const key = `${ctx.font}\0${text}`
  let w = _textWidthCache.get(key)
  if (w === undefined) {
    w = ctx.measureText(text).width
    _textWidthCache.set(key, w)
  }
  return w
}
