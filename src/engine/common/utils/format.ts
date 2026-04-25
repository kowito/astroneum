// @ts-nocheck

import { isNumber, isValid } from './typeChecks'

export interface DateTime {
  YYYY: string
  MM: string
  DD: string
  HH: string
  mm: string
  ss: string
}

const reEscapeChar = /\\(\\)?/g
const rePropName = RegExp(
  '[^.[\\]]+' + '|' +
  '\\[(?:' +
    '([^"\'][^[]*)' + '|' +
    '(["\'])((?:(?!\\2)[^\\\\]|\\\\.)*?)\\2' +
  ')\\]' + '|' +
  '(?=(?:\\.|\\[\\])(?:\\.|\\[\\]|$))'
  , 'g')

export function formatValue (data: unknown, key: string, defaultValue?: unknown): unknown {
  if (isValid(data)) {
    const path: string[] = []
    key.replace(rePropName, (subString: string, ...args: unknown[]) => {
      let k = subString
      if (isValid(args[1])) {
        k = (args[2] as string).replace(reEscapeChar, '$1')
      } else if (isValid(args[0])) {
        k = (args[0] as string).trim()
      }
      path.push(k)
      return ''
    })
    let value = data
    let index = 0
    const length = path.length
    while (isValid(value) && index < length) {
      value = value?.[path[index++]]
    }
    return isValid(value) ? value : (defaultValue ?? '--')
  }
  return defaultValue ?? '--'
}

export function formatTimestampToDateTime (dateTimeFormat: Intl.DateTimeFormat, timestamp: number): DateTime {
  const date: Record<string, string> = {}
  dateTimeFormat.formatToParts(new Date(timestamp)).forEach(({ type, value }) => {
    switch (type) {
      case 'year': {
        date.YYYY = value
        break
      }
      case 'month': {
        date.MM = value
        break
      }
      case 'day': {
        date.DD = value
        break
      }
      case 'hour': {
        date.HH = value === '24' ? '00' : value
        break
      }
      case 'minute': {
        date.mm = value
        break
      }
      case 'second': {
        date.ss = value
        break
      }
      default: { break }
    }
  })
  return date as unknown as DateTime
}

export function formatTimestampByTemplate (dateTimeFormat: Intl.DateTimeFormat, timestamp: number, template: string): string {
  const date = formatTimestampToDateTime(dateTimeFormat, timestamp)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- ignore
  return template.replace(/YYYY|MM|DD|HH|mm|ss/g, key => date[key])
}

export function formatPrecision (value: string | number, precision?: number): string {
  const numericValue = +value
  if (isNumber(numericValue)) {
    return numericValue.toFixed(precision ?? 2)
  }
  return `${value}`
}

export function formatBigNumber (value: string | number): string {
  const numericValue = +value
  if (isNumber(numericValue)) {
    if (numericValue > 1000000000) {
      return `${+((numericValue / 1000000000).toFixed(3))}B`
    }
    if (numericValue > 1000000) {
      return `${+((numericValue / 1000000).toFixed(3))}M`
    }
    if (numericValue > 1000) {
      return `${+((numericValue / 1000).toFixed(3))}K`
    }
  }
  return `${value}`
}

export function formatThousands (value: string | number, sign: string): string {
  const vl = `${value}`
  if (sign.length === 0) {
    return vl
  }
  if (vl.includes('.')) {
    const integerAndDecimalParts = vl.split('.')
    return `${integerAndDecimalParts[0].replace(/(\d)(?=(\d{3})+$)/g, $1 => `${$1}${sign}`)}.${integerAndDecimalParts[1]}`
  }
  return vl.replace(/(\d)(?=(\d{3})+$)/g, $1 => `${$1}${sign}`)
}

export function formatFoldDecimal (value: string | number, threshold: number): string {
  const vl = `${value}`
  const reg = new RegExp('\\.0{' + threshold + ',}[1-9][0-9]*$')
  if (reg.test(vl)) {
    const result = vl.split('.')
    const lastIndex = result.length - 1
    const decimalPart = result[lastIndex]
    const leadingZerosMatch = /0*/.exec(decimalPart)
    if (isValid(leadingZerosMatch)) {
      const leadingZeroCount = leadingZerosMatch[0].length
      result[lastIndex] = decimalPart.replace(/0*/, `0{${leadingZeroCount}}`)
      return result.join('.')
    }
  }
  return vl
}

export function formatTemplateString (template: string, params: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = params[key as string]
    if (isValid(value)) {
      return value as string
    }
    return `{${key}}`
  })
}
