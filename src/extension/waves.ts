import type { OverlayTemplate } from '@/types'

function createWaveOverlay (name: string, totalStep: number): OverlayTemplate {
  return {
    name,
    totalStep,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates }) => {
      const texts = coordinates.map((coordinate, i) => ({
        ...coordinate,
        text: `(${i})`,
        baseline: 'bottom' as const
      }))
      return [
        { type: 'line', attrs: { coordinates } },
        { type: 'text', ignoreEvent: true, attrs: texts }
      ]
    }
  }
}

export const threeWaves = createWaveOverlay('threeWaves', 5)
export const fiveWaves = createWaveOverlay('fiveWaves', 7)
export const eightWaves = createWaveOverlay('eightWaves', 10)
export const anyWaves = createWaveOverlay('anyWaves', Number.MAX_SAFE_INTEGER)
