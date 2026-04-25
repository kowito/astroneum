/**
 * Binary search for the nearest result
 * @param dataList
 * @param valueKey
 * @param targetValue
 * @return {number}
 */
export function binarySearchNearest<T> (dataList: T[], valueKey: keyof T, targetValue: T[keyof T]): number {
  let left = 0
  let right = 0
  for (right = dataList.length - 1; left !== right;) {
    const midIndex = Math.floor((right + left) / 2)
    const mid = right - left
    const midValue = dataList[midIndex][valueKey]
    if (targetValue === dataList[left][valueKey]) {
      return left
    }
    if (targetValue === dataList[right][valueKey]) {
      return right
    }
    if (targetValue === midValue) {
      return midIndex
    }

    if (targetValue > midValue) {
      left = midIndex
    } else {
      right = midIndex
    }

    if (mid <= 2) {
      break
    }
  }
  return left
}

/**
 * 优化数字
 * @param value
 * @return {number|number}
 */
export function nice (value: number): number {
  const exponent = Math.floor(log10(value))
  const exp10 = index10(exponent)
  const normalizedValue = value / exp10 // 1 <= normalizedValue < 10
  let roundedFactor = 0
  if (normalizedValue < 1.5) {
    roundedFactor = 1
  } else if (normalizedValue < 2.5) {
    roundedFactor = 2
  } else if (normalizedValue < 3.5) {
    roundedFactor = 3
  } else if (normalizedValue < 4.5) {
    roundedFactor = 4
  } else if (normalizedValue < 5.5) {
    roundedFactor = 5
  } else if (normalizedValue < 6.5) {
    roundedFactor = 6
  } else {
    roundedFactor = 8
  }
  value = roundedFactor * exp10
  return +value.toFixed(Math.abs(exponent))
}

/**
 * Round
 * @param value
 * @param precision
 * @return {number}
 */
export function round (value: number, precision?: number): number {
  precision = Math.max(0, precision ?? 0)
  const pow = Math.pow(10, precision)
  return Math.round(value * pow) / pow
}

/**
 * Get precision
 * @param value
 * @return {number|number}
 */
export function getPrecision (value: number): number {
  const str = value.toString()
  const eIndex = str.indexOf('e')
  if (eIndex > 0) {
    const precision = +str.slice(eIndex + 1)
    return precision < 0 ? -precision : 0
  }
  const dotIndex = str.indexOf('.')
  return dotIndex < 0 ? 0 : str.length - 1 - dotIndex
}

export function getMaxMin<D> (dataList: D[], maxKey: keyof D, minKey: keyof D): number[] {
  const maxMin = [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]
  const dataLength = dataList.length
  let index = 0
  while (index < dataLength) {
    const data = dataList[index]
    maxMin[0] = Math.max((data[maxKey] ?? Number.MIN_SAFE_INTEGER) as number, maxMin[0])
    maxMin[1] = Math.min((data[minKey] ?? Number.MAX_SAFE_INTEGER) as number, maxMin[1])
    ++index
  }
  return maxMin
}

/**
 * log10
 * @param value
 * @return {number}
 */
export function log10 (value: number): number {
  if (value === 0) {
    return 0
  }
  return Math.log10(value)
}

/**
 * index 10
 * @param value
 * @return {number}
 */
export function index10 (value: number): number {
  return Math.pow(10, value)
}
