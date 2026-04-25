import type DrawWidget from '../widget/DrawWidget'
import XAxisWidget from '../widget/XAxisWidget'

import type { XAxis } from '../component/XAxis'

import DrawPane from './DrawPane'

import { getXAxisClass } from '../extension/x-axis'

export default class XAxisPane extends DrawPane<XAxis> {
  override createAxisComponent (name: string): XAxis {
    const XAxisClass = getXAxisClass(name)
    return new XAxisClass(this)
  }

  override createMainWidget (container: HTMLElement): DrawWidget<DrawPane<XAxis>> {
    return new XAxisWidget(container, this)
  }
}
