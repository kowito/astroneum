import View from './View'
import type { VisibleRangeData } from '../common/Data'
import type BarSpace from '../common/BarSpace'
import type { YAxis } from '../component/YAxis'

export type EachChildCallback = (
  data: VisibleRangeData,
  barSpace: BarSpace,
  index: number
) => void

export default abstract class ChildrenView extends View<YAxis> {
  protected eachChildren (childCallback: EachChildCallback): void {
    const pane = this.getWidget().getPane()
    const chartStore = pane.getChart().getChartStore()
    const visibleRangeDataList = chartStore.getVisibleRangeDataList()
    const barSpace = chartStore.getBarSpace()
    const dataLength = visibleRangeDataList.length
    let index = 0
    while (index < dataLength) {
      childCallback(visibleRangeDataList[index], barSpace, index)
      ++index
    }
  }
}
