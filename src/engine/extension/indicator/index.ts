// @ts-nocheck

import type Nullable from '../../common/Nullable'

import IndicatorImp, { type IndicatorTemplate, type IndicatorConstructor } from '../../component/Indicator'

import averagePrice from './averagePrice'
import awesomeOscillator from './awesomeOscillator'
import bias from './bias'
import bollingerBands from './bollingerBands'
import brar from './brar'
import bullAndBearIndex from './bullAndBearIndex'
import commodityChannelIndex from './commodityChannelIndex'
import currentRatio from './currentRatio'
import differentOfMovingAverage from './differentOfMovingAverage'
import directionalMovementIndex from './directionalMovementIndex'
import easeOfMovementValue from './easeOfMovementValue'
import exponentialMovingAverage from './exponentialMovingAverage'
import momentum from './momentum'
import movingAverage from './movingAverage'
import movingAverageConvergenceDivergence from './movingAverageConvergenceDivergence'
import onBalanceVolume from './onBalanceVolume'
import priceAndVolumeTrend from './priceAndVolumeTrend'
import psychologicalLine from './psychologicalLine'
import rateOfChange from './rateOfChange'
import relativeStrengthIndex from './relativeStrengthIndex'
import simpleMovingAverage from './simpleMovingAverage'
import stoch from './stoch'
import stopAndReverse from './stopAndReverse'
import tripleExponentiallySmoothedAverage from './tripleExponentiallySmoothedAverage'
import volume from './volume'
import volumeRatio from './volumeRatio'
import williamsR from './williamsR'

const indicators: Record<string, IndicatorConstructor> = {}

const extensions = [
  averagePrice, awesomeOscillator, bias, bollingerBands, brar,
  bullAndBearIndex, commodityChannelIndex, currentRatio, differentOfMovingAverage,
  directionalMovementIndex, easeOfMovementValue, exponentialMovingAverage, momentum,
  movingAverage, movingAverageConvergenceDivergence, onBalanceVolume, priceAndVolumeTrend,
  psychologicalLine, rateOfChange, relativeStrengthIndex, simpleMovingAverage,
  stoch, stopAndReverse, tripleExponentiallySmoothedAverage, volume, volumeRatio, williamsR
]

extensions.forEach((indicator: IndicatorTemplate) => {
  indicators[indicator.name] = IndicatorImp.extend(indicator)
})

function registerIndicator<D = unknown, C = unknown, E = unknown> (indicator: IndicatorTemplate<D, C, E>): void {
  indicators[indicator.name] = IndicatorImp.extend(indicator)
}

function getIndicatorClass (name: string): Nullable<IndicatorConstructor> {
  return indicators[name] ?? null
}

function getSupportedIndicators (): string[] {
  return Object.keys(indicators)
}

export { registerIndicator, getIndicatorClass, getSupportedIndicators }
