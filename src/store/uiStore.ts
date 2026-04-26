import { useCallback, useRef, useState } from 'react'

export interface LineStyleEntry {
  color: string
  show: boolean
}

export interface IndicatorSettingModalState {
  visible: boolean
  indicatorName: string
  paneId: string
  calcParams: number[]
  lineStyles: LineStyleEntry[]
}

export const EMPTY_INDICATOR_SETTING: IndicatorSettingModalState = {
  visible: false,
  indicatorName: '',
  paneId: '',
  calcParams: [],
  lineStyles: []
}

export function useUIStore (init: { drawingBarVisible: boolean }) {
  const [drawingBarVisible, setDrawingBarVisible] = useState(init.drawingBarVisible)
  const drawingBarVisibleRef = useRef(drawingBarVisible)
  drawingBarVisibleRef.current = drawingBarVisible

  const [symbolSearchModalVisible, setSymbolSearchModalVisible] = useState(false)
  const symbolSearchModalVisibleRef = useRef(symbolSearchModalVisible)
  symbolSearchModalVisibleRef.current = symbolSearchModalVisible

  const [indicatorModalVisible, setIndicatorModalVisible] = useState(false)
  const indicatorModalVisibleRef = useRef(indicatorModalVisible)
  indicatorModalVisibleRef.current = indicatorModalVisible

  const [timezoneModalVisible, setTimezoneModalVisible] = useState(false)
  const timezoneModalVisibleRef = useRef(timezoneModalVisible)
  timezoneModalVisibleRef.current = timezoneModalVisible

  const [settingModalVisible, setSettingModalVisible] = useState(false)
  const settingModalVisibleRef = useRef(settingModalVisible)
  settingModalVisibleRef.current = settingModalVisible

  const [screenshotUrl, setScreenshotUrl] = useState('')
  const screenshotUrlRef = useRef(screenshotUrl)
  screenshotUrlRef.current = screenshotUrl

  const [loadingVisible, setLoadingVisible] = useState(false)
  const loadingVisibleRef = useRef(loadingVisible)
  loadingVisibleRef.current = loadingVisible

  const [indicatorSettingModalParams, setIndicatorSettingModalParams] =
    useState<IndicatorSettingModalState>(EMPTY_INDICATOR_SETTING)
  const indicatorSettingModalParamsRef = useRef(indicatorSettingModalParams)
  indicatorSettingModalParamsRef.current = indicatorSettingModalParams

  const getDrawingBarVisible = useCallback(() => drawingBarVisibleRef.current, [])
  const getSymbolSearchModalVisible = useCallback(() => symbolSearchModalVisibleRef.current, [])
  const getIndicatorModalVisible = useCallback(() => indicatorModalVisibleRef.current, [])
  const getTimezoneModalVisible = useCallback(() => timezoneModalVisibleRef.current, [])
  const getSettingModalVisible = useCallback(() => settingModalVisibleRef.current, [])
  const getScreenshotUrl = useCallback(() => screenshotUrlRef.current, [])
  const getLoadingVisible = useCallback(() => loadingVisibleRef.current, [])
  const getIndicatorSettingModalParams = useCallback(() => indicatorSettingModalParamsRef.current, [])

  return {
    drawingBarVisible: getDrawingBarVisible, setDrawingBarVisible,
    symbolSearchModalVisible: getSymbolSearchModalVisible, setSymbolSearchModalVisible,
    indicatorModalVisible: getIndicatorModalVisible, setIndicatorModalVisible,
    timezoneModalVisible: getTimezoneModalVisible, setTimezoneModalVisible,
    settingModalVisible: getSettingModalVisible, setSettingModalVisible,
    screenshotUrl: getScreenshotUrl, setScreenshotUrl,
    loadingVisible: getLoadingVisible, setLoadingVisible,
    indicatorSettingModalParams: getIndicatorSettingModalParams, setIndicatorSettingModalParams
  }
}

export type UIStore = ReturnType<typeof useUIStore>
