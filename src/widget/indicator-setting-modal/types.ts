export interface IndicatorParamConfig {
  paramNameKey: string
  precision: number
  min: number
  default?: number
  styleKey?: string
}

export type IndicatorConfigMap = Readonly<Record<string, IndicatorParamConfig[]>>
