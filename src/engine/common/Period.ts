export type { Timespan as PeriodType, Period } from '@/types'

export const PeriodTypeXAxisFormat: Record<string, string> = {
  second: 'HH:mm:ss',
  minute: 'HH:mm',
  hour: 'MM-DD HH:mm',
  day: 'YYYY-MM-DD',
  week: 'YYYY-MM-DD',
  month: 'YYYY-MM',
  year: 'YYYY'
}

export const PeriodTypeCrosshairTooltipFormat: Record<string, string> = {
  second: 'DD/MM/YYYY, HH:mm:ss',
  minute: 'DD/MM/YYYY, HH:mm',
  hour: 'DD/MM/YYYY, HH:mm',
  day: 'DD/MM/YYYY',
  week: 'DD/MM/YYYY',
  month: 'MM/YYYY',
  year: 'YYYY'
}
