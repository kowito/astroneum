const DEV = typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true

function log (templateText: string, tagStyle: string, messageStyle: string, api: string, invalidParam: string, append: string): void {
  if (DEV) {
    const apiStr = api !== '' ? `Call api \`${api}\`${invalidParam !== '' || append !== '' ? ', ' : '.'}` : ''
    const invalidParamStr = invalidParam !== '' ? `invalid parameter \`${invalidParam}\`${append !== '' ? ', ' : '.'}` : ''
    const appendStr = append !== '' ? append : ''
    console.log(templateText, tagStyle, messageStyle, apiStr, invalidParamStr, appendStr)
  }
}

export function logWarn (api: string, invalidParam: string, append?: string): void {
  log(
    '%c😑 astroneum warning%c %s%s%s',
    'padding:3px 4px;border-radius:2px;color:#ffffff;background-color:#FF9600',
    'color:#FF9600',
    api, invalidParam, append ?? ''
  )
}

export function logError (api: string, invalidParam: string, append?: string): void {
  log(
    '%c😟 astroneum error%c %s%s%s',
    'padding:3px 4px;border-radius:2px;color:#ffffff;background-color:#F92855;',
    'color:#F92855;',
    api, invalidParam, append ?? ''
  )
}

export function logTag (): void {
  log(
    '%c❤️ Welcome to Astroneum. Version is __VERSION__',
    'border-radius:4px;border:dashed 1px #1677FF;line-height:70px;padding:0 20px;margin:16px 0;font-size:14px;color:#1677FF;',
    '',
    '',
    '',
    ''
  )
}
