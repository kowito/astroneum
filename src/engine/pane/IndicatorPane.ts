import type Nullable from '../common/Nullable'

import type DrawWidget from '../widget/DrawWidget'
import IndicatorWidget from '../widget/IndicatorWidget'
import YAxisWidget from '../widget/YAxisWidget'

import type { YAxis } from '../component/YAxis'

import { getYAxisClass } from '../extension/y-axis'

import DrawPane from './DrawPane'

export default class IndicatorPane extends DrawPane<YAxis> {
  override createAxisComponent (name?: string): YAxis {
    const YAxisClass = getYAxisClass(name ?? 'default')
    return new YAxisClass(this)
  }

  override createMainWidget (container: HTMLElement): DrawWidget<DrawPane<YAxis>> {
    return new IndicatorWidget(container, this)
  }

  override createYAxisWidget (container: HTMLElement): Nullable<YAxisWidget> {
    return new YAxisWidget(container, this)
  }
}
