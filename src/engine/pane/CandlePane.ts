import type DrawWidget from '../widget/DrawWidget'
import CandleWidget from '../widget/CandleWidget'

import type DrawPane from './DrawPane'
import IndicatorPane from './IndicatorPane'
import type { YAxis } from '../component/YAxis'

export default class CandlePane extends IndicatorPane {
  override createMainWidget (container: HTMLElement): DrawWidget<DrawPane<YAxis>> {
    return new CandleWidget(container, this)
  }
}
