// ---------------------------------------------------------------------------
// Shared constants, shader sources and colour helpers for the candle GL renderer.
//
// Imported by:
//   • CandleWebGLRenderer  — main-thread WebGL2 path
//   • CandleWorkerRenderer — OffscreenCanvas + Web Worker path
//
// Keeping both renderers byte-identical ensures a seamless capability switch
// without visual differences.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Memory layout — packed per-instance VBO  (32 bytes / bar)
//
//  Byte  0– 3  Float32    centerX     (screen X in CSS pixels)
//  Byte  4– 7  Float32    open
//  Byte  8–11  Float32    high
//  Byte 12–15  Float32    low
//  Byte 16–19  Float32    close
//  Byte 20–23  UByte×4    wickColor   (R G B A, normalised → 0..1 in shader)
//  Byte 24–27  UByte×4    bodyColor
//  Byte 28–31  UByte×4    borderColor
// ---------------------------------------------------------------------------
export const BYTES_PER_BAR  = 32
export const COLOR_BYTE_OFF = 20    // byte offset of first colour field per bar
export const VERTS_PER_BAR  = 18    // (wick 0–5) + (body-outer 6–11) + (body-inner 12–17)

// ---------------------------------------------------------------------------
// Vertex shader
//
// 18 vertices per instance:
//   0 – 5  → wick quad    (1 px wide, full high–low range)
//   6 – 11 → body-outer   (full bar width, fill with border colour)
//  12 – 17 → body-inner   (inset 1 px on each side, fill with body colour)
// ---------------------------------------------------------------------------
export const VERT_SRC = /* glsl */`#version 300 es
precision highp float;

// Per-instance attributes (divisor = 1)
in float a_centerX;
in float a_open;
in float a_high;
in float a_low;
in float a_close;
in vec4  a_wickColor;
in vec4  a_bodyColor;
in vec4  a_borderColor;

uniform float u_priceFrom;    // realFrom of the visible Y range
uniform float u_priceRange;   // realRange of the visible Y range
uniform vec2  u_resolution;   // canvas physical pixel dimensions
uniform float u_pixelRatio;   // CSS px → physical px
uniform float u_barHalfWidth; // half bar gapBar width, in CSS pixels
// Render mode: 0 = candle (solid/stroke), 1 = ohlc
uniform int   u_renderMode;
// Half of ohlcSize in CSS pixels — only used when u_renderMode == 1
uniform float u_ohlcHalfSize;
// Pan-offset optimisation: CSS pixel delta added to every bar's a_centerX so
// pure-pan frames skip bufferSubData and update only this uniform (O(1)).
uniform float u_panOffset;

out vec4 v_color;

// Unit-quad positions shared by all three sub-quads
vec2 unitQuad(int id) {
  if (id == 0) return vec2(0.0, 0.0);
  if (id == 1) return vec2(1.0, 0.0);
  if (id == 2) return vec2(0.0, 1.0);
  if (id == 3) return vec2(0.0, 1.0);
  if (id == 4) return vec2(1.0, 0.0);
              return vec2(1.0, 1.0);
}

// GPU price → physical screen-Y pixel
float priceToPhysY(float price) {
  float rate = (price - u_priceFrom) / u_priceRange;
  return (1.0 - rate) * u_resolution.y;
}

void main() {
  bool isWick      = gl_VertexID < 6;
  bool isBodyOuter = gl_VertexID >= 6  && gl_VertexID < 12;
  // isBodyInner   = gl_VertexID >= 12

  int localId = gl_VertexID < 6  ? gl_VertexID :
                gl_VertexID < 12 ? gl_VertexID - 6 :
                                   gl_VertexID - 12;
  vec2 unit = unitQuad(localId);

  float highY  = priceToPhysY(a_high);
  float lowY   = priceToPhysY(a_low);
  float openY  = priceToPhysY(a_open);
  float closeY = priceToPhysY(a_close);

  float pr   = u_pixelRatio;
  float cx   = (a_centerX + u_panOffset) * pr;  // pan-offset + CSS px → physical px
  float bhw  = u_barHalfWidth * pr;

  float screenX, screenY;

  if (u_renderMode == 1) {
    // ── OHLC mode ──────────────────────────────────────────────────────────
    // wick:       center-aligned vertical bar, width = ohlcSize
    // body-outer: open  stub (left  side: cx-bhw → cx-ohw)
    // body-inner: close stub (right side: cx+ohw → cx+bhw)
    float ohw   = u_ohlcHalfSize * pr;  // half ohlcSize in physical px
    float tickH = ohw * 2.0;            // tick height = ohlcSize

    if (isWick) {
      screenX = cx - ohw + unit.x * ohw * 2.0;
      screenY = highY + (lowY - highY) * unit.y;
      v_color = a_bodyColor;
    } else if (isBodyOuter) {
      float left  = cx - bhw;
      float right = cx - ohw;
      screenX = left  + unit.x * max(right - left, 0.0);
      screenY = openY + unit.y * tickH;
      v_color = a_bodyColor;
    } else {
      float left  = cx + ohw;
      float right = cx + bhw;
      screenX = left   + unit.x * max(right - left, 0.0);
      screenY = closeY + unit.y * tickH;
      v_color = a_bodyColor;
    }
  } else {
    // ── Candle mode (solid / stroke) ───────────────────────────────────────
    float bodyTop    = min(openY, closeY);
    float bodyBottom = max(openY, closeY);
    bodyBottom       = max(bodyBottom, bodyTop + 1.0); // min 1px body

    if (isWick) {
      screenX = cx - 0.5 + unit.x;
      screenY = highY + (lowY - highY) * unit.y;
      v_color = a_wickColor;
    } else if (isBodyOuter) {
      screenX = cx - bhw + unit.x * bhw * 2.0;
      screenY = bodyTop + (bodyBottom - bodyTop) * unit.y;
      v_color = a_borderColor;
    } else {
      // body inner — 1 physical pixel inset on each side.
      // For stroke types, bodyColor alpha = 0 → body-inner is transparent,
      // leaving only the body-outer border visible (hollow candle).
      float inset = 1.0;
      float innerHW = max(bhw - inset, 0.5);
      screenX = cx - innerHW + unit.x * innerHW * 2.0;
      float innerTop    = bodyTop + inset;
      float innerBottom = max(bodyBottom - inset, innerTop);
      screenY = innerTop + (innerBottom - innerTop) * unit.y;
      v_color = a_bodyColor;
    }
  }

  // Physical pixel → NDC (executes for both OHLC and Candle modes)
  gl_Position = vec4(
    screenX / u_resolution.x * 2.0 - 1.0,
    1.0 - screenY / u_resolution.y * 2.0,
    0.0, 1.0
  );
}
`

export const FRAG_SRC = /* glsl */`#version 300 es
precision mediump float;
in  vec4 v_color;
out vec4 fragColor;
void main() { fragColor = v_color; }
`

// ---------------------------------------------------------------------------
// Colour helpers — shared between main-thread and worker data-preparation paths
// ---------------------------------------------------------------------------

export function hexToRgba (hex: string): [number, number, number, number] {
  const hexValue = hex.replace('#', '')
  if (hexValue.length === 6 || hexValue.length === 8) {
    const r = parseInt(hexValue.slice(0, 2), 16) / 255
    const g = parseInt(hexValue.slice(2, 4), 16) / 255
    const b = parseInt(hexValue.slice(4, 6), 16) / 255
    const a = hexValue.length === 8 ? parseInt(hexValue.slice(6, 8), 16) / 255 : 1
    return [r, g, b, a]
  }
  // RGB shorthand (#abc)
  if (hexValue.length === 3) {
    const r = parseInt(hexValue[0] + hexValue[0], 16) / 255
    const g = parseInt(hexValue[1] + hexValue[1], 16) / 255
    const b = parseInt(hexValue[2] + hexValue[2], 16) / 255
    return [r, g, b, 1]
  }
  return [0, 0, 0, 1]
}

/** Parse any CSS colour string to [r,g,b,a] in [0..1] */
export function parseColor (color: string): [number, number, number, number] {
  if (color.startsWith('#')) return hexToRgba(color)
  // rgba(...) / rgb(...)
  const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/)
  if (m !== null) {
    return [
      parseFloat(m[1]) / 255,
      parseFloat(m[2]) / 255,
      parseFloat(m[3]) / 255,
      m[4] !== undefined ? parseFloat(m[4]) : 1
    ]
  }
  return [0, 0, 0, 1]
}
