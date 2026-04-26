import { useCallback, useRef, useState } from 'react'
import type { IndicatorDef } from '@/types'

export function useIndicatorStore (init: { mainIndicators: IndicatorDef[] }) {
  const [mainIndicators, setMainIndicators] = useState<IndicatorDef[]>([...init.mainIndicators])
  const mainIndicatorsRef = useRef(mainIndicators)
  mainIndicatorsRef.current = mainIndicators

  const [subIndicators, setSubIndicators] = useState<Record<string, string>>({})
  const subIndicatorsRef = useRef(subIndicators)
  subIndicatorsRef.current = subIndicators

  const getMainIndicators = useCallback(() => mainIndicatorsRef.current, [])
  const getSubIndicators = useCallback(() => subIndicatorsRef.current, [])

  return {
    mainIndicators: getMainIndicators, setMainIndicators,
    subIndicators: getSubIndicators, setSubIndicators
  }
}

export type IndicatorStore = ReturnType<typeof useIndicatorStore>
