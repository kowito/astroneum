export const enum UpdateLevel {
  Main,
  Overlay,
  Separator,
  Drawer,
  All
}

export default interface Updater {
  update: (level?: UpdateLevel) => void
}
