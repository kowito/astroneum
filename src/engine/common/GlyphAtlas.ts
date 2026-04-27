/**
 * GlyphAtlas — Pre-rasterises a fixed charset into a single RGBA WebGL2 texture.
 *
 * Each character is rendered at RENDER_SCALE × the requested CSS font size so that
 * the raster looks crisp on HiDPI (up to 2× DPR) displays. The atlas is uploaded
 * once per (fontSize, fontFamily) pair per WebGL2 context; subsequent lookups are
 * served from the per-renderer cache in TextWebGLRenderer.
 */

/** Characters needed for financial charts: digits, punctuation, common labels. */
export const GLYPH_CHARSET =
  '0123456789.,+-eEkKMBT%$ /()[]ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  'abcdefghijklmnopqrstuvwxyz:€¥£¢'

/**
 * Rasterisation over-sample factor.
 * Uses the actual device pixel ratio (min 2) so glyphs are always 1:1
 * with physical pixels on any display density.
 */
function getRenderScale (): number {
  return Math.max(Math.ceil(typeof window !== 'undefined' ? (window.devicePixelRatio ?? 2) : 2), 2)
}

export interface GlyphMetrics {
  /** Left UV coordinate (0–1) in the atlas texture. */
  u0: number
  /** Top UV coordinate (0–1) in the atlas texture. */
  v0: number
  /** Right UV coordinate (0–1) in the atlas texture. */
  u1: number
  /** Bottom UV coordinate (0–1) in the atlas texture. */
  v1: number
  /** Horizontal advance in CSS pixels at the reference font size. */
  advance: number
  /** Glyph cell width in CSS pixels (full cell, may exceed advance). */
  cellW: number
  /** Glyph cell height in CSS pixels. */
  cellH: number
}

export class GlyphAtlas {
  /** CSS font size this atlas was built for. */
  readonly fontSize: number
  /** Font family string this atlas was built for. */
  readonly fontFamily: string

  private _texture: WebGLTexture | null = null
  private readonly _glyphs = new Map<string, GlyphMetrics>()

  constructor (fontSize: number, fontFamily: string) {
    this.fontSize = fontSize
    this.fontFamily = fontFamily
  }

  /**
   * Rasterises every character in GLYPH_CHARSET onto an off-screen Canvas2D
   * and uploads the result as an RGBA texture to `gl`.
   * Call once before use; idempotent (calling twice is a no-op if texture
   * is already allocated).
   */
  build (gl: WebGL2RenderingContext): void {
    if (this._texture !== null) return

    const RENDER_SCALE = getRenderScale()
    const chars = Array.from(new Set(GLYPH_CHARSET))

    // Measure each glyph at the render-scale font size.
    const renderPx = this.fontSize * RENDER_SCALE
    const tmp = document.createElement('canvas')
    const tmpCtx = tmp.getContext('2d')!
    tmpCtx.font = `${renderPx}px ${this.fontFamily}`

    // Cell dimensions: height = 1.5× render px to fit descenders; width per char.
    const cellH = Math.ceil(renderPx * 1.5)
    const advances: number[] = chars.map(ch => tmpCtx.measureText(ch).width)
    // Uniform cell width = max advance + small margin so glyphs never bleed.
    const maxAdv = Math.max(...advances)
    const cellW = Math.ceil(maxAdv + renderPx * 0.2)

    // Grid layout: aim for a square texture.
    const cols = Math.ceil(Math.sqrt(chars.length))
    const rows = Math.ceil(chars.length / cols)
    const atlasW = cols * cellW
    const atlasH = rows * cellH

    tmp.width = atlasW
    tmp.height = atlasH
    // Re-apply font after resize (resize resets canvas state).
    tmpCtx.font = `${renderPx}px ${this.fontFamily}`
    tmpCtx.textBaseline = 'top'
    tmpCtx.fillStyle = 'white'

    chars.forEach((ch, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = col * cellW
      const y = row * cellH
      tmpCtx.fillText(ch, x, y)
      this._glyphs.set(ch, {
        u0: x / atlasW,
        v0: y / atlasH,
        u1: (x + cellW) / atlasW,
        v1: (y + cellH) / atlasH,
        advance: advances[i] / RENDER_SCALE,
        cellW: cellW / RENDER_SCALE,
        cellH: cellH / RENDER_SCALE
      })
    })

    // Upload to GPU as RGBA texture (white glyphs on transparent background).
    const imageData = tmpCtx.getImageData(0, 0, atlasW, atlasH)
    this._texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this._texture)
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA,
      atlasW, atlasH, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, imageData.data
    )
    // Keep glyph edges crisp; linear filtering softens small numeric labels.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindTexture(gl.TEXTURE_2D, null)
  }

  /** Returns glyph metrics for `ch`, or `null` if not in the charset. */
  getGlyph (ch: string): GlyphMetrics | null {
    return this._glyphs.get(ch) ?? null
  }

  get texture (): WebGLTexture | null { return this._texture }

  /** Release GPU resources. */
  destroy (gl: WebGL2RenderingContext): void {
    if (this._texture !== null) {
      gl.deleteTexture(this._texture)
      this._texture = null
    }
  }
}
