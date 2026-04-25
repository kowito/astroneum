import { isValid, merge } from './utils/typeChecks'

export default interface Bounding {
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
}

export function createDefaultBounding (bounding?: Partial<Bounding>): Bounding {
  const defaultBounding: Bounding = {
    width: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0
  }
  if (isValid(bounding)) {
    merge(defaultBounding, bounding)
  }
  return defaultBounding
}
