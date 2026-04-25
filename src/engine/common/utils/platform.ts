export function isFF (): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return window.navigator.userAgent.toLowerCase().includes('firefox')
}

export function isIOS (): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return /iPhone|iPad|iPod|iOS/.test(window.navigator.userAgent)
}
