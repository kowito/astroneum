import type Nullable from '../../common/Nullable'
import type DeepPartial from '../../common/DeepPartial'
import type { Styles } from '../../common/Styles'

import light from './light'
import dark from './dark'

const styles: Record<string, DeepPartial<Styles>> = {
  light,
  dark
}

function registerStyles (name: string, ss: DeepPartial<Styles>): void {
  styles[name] = ss
}

function getStyles (name: string): Nullable<DeepPartial<Styles>> {
  return styles[name] ?? null
}

export {
  registerStyles,
  getStyles
}
