import enUS from './en-US.json'
import zhCN from './zh-CN.json'
import jaJP from './ja-JP.json'
import koKR from './ko-KR.json'
import deDE from './de-DE.json'
import frFR from './fr-FR.json'
import esES from './es-ES.json'
import ptBR from './pt-BR.json'
import ruRU from './ru-RU.json'
import arSA from './ar-SA.json'
import hiIN from './hi-IN.json'
import trTR from './tr-TR.json'
import nlNL from './nl-NL.json'
import plPL from './pl-PL.json'
import itIT from './it-IT.json'
import viVN from './vi-VN.json'
import thTH from './th-TH.json'
import idID from './id-ID.json'

export { zhCN, jaJP, koKR, deDE, frFR, esES, ptBR, ruRU, arSA, hiIN, trTR, nlNL, plPL, itIT, viVN, thTH, idID }

type LocaleKey = keyof typeof enUS
type LocaleMap = Partial<Record<LocaleKey, string>>

const locales: Record<string, LocaleMap> = {
  'en-US': enUS,
  'zh-CN': zhCN,
  'ja-JP': jaJP,
  'ko-KR': koKR,
  'de-DE': deDE,
  'fr-FR': frFR,
  'es-ES': esES,
  'pt-BR': ptBR,
  'ru-RU': ruRU,
  'ar-SA': arSA,
  'hi-IN': hiIN,
  'tr-TR': trTR,
  'nl-NL': nlNL,
  'pl-PL': plPL,
  'it-IT': itIT,
  'vi-VN': viVN,
  'th-TH': thTH,
  'id-ID': idID
}

export function load (key: string, ls: LocaleMap): void {
  locales[key] = ls
}

export default (key: string, locale: string): string => {
  return (locales[locale]?.[key as LocaleKey] ?? key)
}
