export default interface VisibleRange {
  readonly from: number
  readonly to: number
  readonly realFrom: number
  readonly realTo: number
}

export function getDefaultVisibleRange (): VisibleRange {
  return { from: 0, to: 0, realFrom: 0, realTo: 0 }
}
