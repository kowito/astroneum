import type PickRequired from './PickRequired'

type ExcludePickPartial<T, K extends keyof T> = PickRequired<Partial<T>, K>

export default ExcludePickPartial
