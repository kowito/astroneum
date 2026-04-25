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

export function createFont (size?: number, weight?: string | number, family?: string): string {
  return `${weight ?? 'normal'} ${size ?? 12}px ${family ?? 'Helvetica Neue'}`
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
