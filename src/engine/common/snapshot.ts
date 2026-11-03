// The GPU canvases are created with preserveDrawingBuffer: false (WebGPU has no
// such option at all), so once the browser presents a frame their pixels can no
// longer be read. A snapshot therefore redraws every layer and copies it in the
// same task. While it runs, the renderers must not skip a draw because nothing
// changed: the canvas would still look right on screen but read back empty.

let depth = 0

export function isTakingSnapshot (): boolean {
  return depth > 0
}

export function takeSnapshot<T> (fn: () => T): T {
  depth++
  try {
    return fn()
  } finally {
    depth--
  }
}
