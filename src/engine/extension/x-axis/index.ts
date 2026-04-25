import XAxisImp, { type XAxisTemplate, type XAxisConstructor } from '../../component/XAxis'

import normal from './normal'

const xAxises: Record<string, XAxisConstructor> = {
  normal: XAxisImp.extend(normal)
}

function registerXAxis (axis: XAxisTemplate): void {
  xAxises[axis.name] = XAxisImp.extend(axis)
}

function getXAxisClass (name: string): XAxisConstructor {
  return xAxises[name] ?? xAxises.normal
}

export {
  registerXAxis,
  getXAxisClass
}
