import i18n from '@/i18n'

import { type SelectDataSourceItem } from '@/component'

const timezones: [string, string][] = [
  ['Etc/UTC', 'utc'],
  ['Pacific/Honolulu', 'honolulu'],
  ['America/Juneau', 'juneau'],
  ['America/Los_Angeles', 'los_angeles'],
  ['America/Chicago', 'chicago'],
  ['America/Toronto', 'toronto'],
  ['America/Sao_Paulo', 'sao_paulo'],
  ['Europe/London', 'london'],
  ['Europe/Berlin', 'berlin'],
  ['Asia/Bahrain', 'bahrain'],
  ['Asia/Dubai', 'dubai'],
  ['Asia/Ashkhabad', 'ashkhabad'],
  ['Asia/Almaty', 'almaty'],
  ['Asia/Bangkok', 'bangkok'],
  ['Asia/Shanghai', 'shanghai'],
  ['Asia/Tokyo', 'tokyo'],
  ['Australia/Sydney', 'sydney'],
  ['Pacific/Norfolk', 'norfolk'],
]

const i18nKeyByTz = new Map(timezones.map(([tz, key]) => [tz, key]))

export function translateTimezone (timezone: string, locale: string): string {
  const key = i18nKeyByTz.get(timezone)
  return key ? i18n(key, locale) : timezone
}

export function createTimezoneSelectOptions (locale: string): SelectDataSourceItem[] {
  return timezones.map(([tz, key]) => ({ key: tz, text: i18n(key, locale) }))
}