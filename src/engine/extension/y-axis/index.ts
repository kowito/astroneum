import YAxisImp, { type YAxisTemplate, type YAxisConstructor } from '../../component/YAxis'

import normal from './normal'
import percentage from './percentage'
import logarithm from './logarithm'

const yAxises: Record<string, YAxisConstructor> = {
  normal: YAxisImp.extend(normal),
  percentage: YAxisImp.extend(percentage),
  logarithm: YAxisImp.extend(logarithm)
}

function registerYAxis (axis: YAxisTemplate): void {
  yAxises[axis.name] = YAxisImp.extend(axis)
}

function getYAxisClass (name: string): YAxisConstructor {
  return yAxises[name] ?? yAxises.normal
}

export {
  registerYAxis,
  getYAxisClass
}
