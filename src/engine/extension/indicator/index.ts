// @ts-nocheck

import type Nullable from '../../common/Nullable'

import IndicatorImp, { type IndicatorTemplate, type IndicatorConstructor } from '../../component/Indicator'
import { withWorkerOffload } from '../../workers/indicatorOffload'
import type { IndicatorKind } from '../../workers/TypedArrayIndicators'

import accumulationDistribution from './accumulationDistribution'
import adaptiveMovingAverage from './adaptiveMovingAverage'
import averageDirectionalIndex from './averageDirectionalIndex'
import averagePrice from './averagePrice'
import averageTrueRange from './averageTrueRange'
import awesomeOscillator from './awesomeOscillator'
import bias from './bias'
import bollingerBands from './bollingerBands'
import brar from './brar'
import bullAndBearIndex from './bullAndBearIndex'
import chaikinMoneyFlow from './chaikinMoneyFlow'
import closeLine from './closeLine'
import commodityChannelIndex from './commodityChannelIndex'
import correlationCoefficient from './correlationCoefficient'
import currentRatio from './currentRatio'
import differentOfMovingAverage from './differentOfMovingAverage'
import directionalMovementIndex from './directionalMovementIndex'
import donchianChannels from './donchianChannels'
import doubleExponentialMovingAverage from './doubleExponentialMovingAverage'
import easeOfMovementValue from './easeOfMovementValue'
import exponentialMovingAverage from './exponentialMovingAverage'
import historicalVolatility from './historicalVolatility'
import hullMovingAverage from './hullMovingAverage'
import ichimokuCloud from './ichimokuCloud'
import keltnerChannels from './keltnerChannels'
import linearRegression from './linearRegression'
import momentum from './momentum'
import moneyFlowIndex from './moneyFlowIndex'
import movingAverage from './movingAverage'
import movingAverageConvergenceDivergence from './movingAverageConvergenceDivergence'
import onBalanceVolume from './onBalanceVolume'
import pivotPoints from './pivotPoints'
import priceAndVolumeTrend from './priceAndVolumeTrend'
import psychologicalLine from './psychologicalLine'
import rateOfChange from './rateOfChange'
import relativeStrengthIndex from './relativeStrengthIndex'
import simpleMovingAverage from './simpleMovingAverage'
import standardDeviation from './standardDeviation'
import stoch from './stoch'
import stopAndReverse from './stopAndReverse'
import superTrend from './superTrend'
import tripleExponentialMovingAverage from './tripleExponentialMovingAverage'
import tripleExponentiallySmoothedAverage from './tripleExponentiallySmoothedAverage'
import volume from './volume'
import volumeRateOfChange from './volumeRateOfChange'
import volumeRatio from './volumeRatio'
import volumeWeightedAveragePrice from './volumeWeightedAveragePrice'
import volumeWeightedMovingAverage from './volumeWeightedMovingAverage'
import weightedMovingAverage from './weightedMovingAverage'
import williamsR from './williamsR'
import zigzag from './zigzag'

const indicators: Record<string, IndicatorConstructor> = {}

const extensions = [
  accumulationDistribution, adaptiveMovingAverage, averageDirectionalIndex,
  averagePrice, averageTrueRange, awesomeOscillator, bias, bollingerBands, brar,
  bullAndBearIndex, chaikinMoneyFlow, closeLine, commodityChannelIndex, correlationCoefficient,
  currentRatio, differentOfMovingAverage, directionalMovementIndex, donchianChannels,
  doubleExponentialMovingAverage, easeOfMovementValue, exponentialMovingAverage,
  historicalVolatility, hullMovingAverage, ichimokuCloud, keltnerChannels,
  linearRegression, momentum, moneyFlowIndex,
  movingAverage, movingAverageConvergenceDivergence, onBalanceVolume, pivotPoints,
  priceAndVolumeTrend, psychologicalLine, rateOfChange, relativeStrengthIndex,
  simpleMovingAverage, standardDeviation, stoch, stopAndReverse, superTrend,
  tripleExponentialMovingAverage, tripleExponentiallySmoothedAverage,
  volume, volumeRateOfChange, volumeRatio, volumeWeightedAveragePrice,
  volumeWeightedMovingAverage, weightedMovingAverage, williamsR, zigzag
]

// Built-ins with step kernels: ticks and new bars step from saved state, and full
// runs can go to workers (see configureIndicatorWorkers).
const ACCELERATED: Record<string, IndicatorKind> = { MA: 'MA', EMA: 'EMA', RSI: 'RSI', BOLL: 'BOLL', VOL: 'VOL', MACD: 'MACD' }

extensions.forEach((indicator: IndicatorTemplate) => {
  const kind = ACCELERATED[indicator.name]
  indicators[indicator.name] = IndicatorImp.extend(kind !== undefined ? withWorkerOffload(indicator, kind) : indicator)
})

function registerIndicator<D = unknown, C = unknown, E = unknown>(indicator: IndicatorTemplate<D, C, E>): void {
  indicators[indicator.name] = IndicatorImp.extend(indicator)
}

function getIndicatorClass(name: string): Nullable<IndicatorConstructor> {
  return indicators[name] ?? null
}

function getSupportedIndicators(): string[] {
  return Object.keys(indicators)
}

export { registerIndicator, getIndicatorClass, getSupportedIndicators }
