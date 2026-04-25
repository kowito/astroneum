import type { Locales } from '../../Options'

import zhCN from './zh-CN'
import zhTW from './zh-TW'
import enUS from './en-US'
import jaJP from './ja-JP'
import thTH from './th-TH'
import koKR from './ko-KR'
import frFR from './fr-FR'
import deDE from './de-DE'
import ptPT from './pt-PT'
import esES from './es-ES'
import idID from './id-ID'

const locales: Record<string, Locales> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'en-US': enUS,
  'ja-JP': jaJP,
  'th-TH': thTH,
  'ko-KR': koKR,
  'fr-FR': frFR,
  'de-DE': deDE,
  'pt-PT': ptPT,
  'es-ES': esES,
  'id-ID': idID
}

function registerLocale (locale: string, ls: Locales): void {
  locales[locale] = { ...locales[locale], ...ls }
}

function getSupportedLocales (): string[] {
  return Object.keys(locales)
}

function i18n (key: string, locale: string): string {
  return locales[locale][key] ?? key
}

export { i18n, registerLocale, getSupportedLocales }
