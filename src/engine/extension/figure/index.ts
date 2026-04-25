// @ts-nocheck

import type Nullable from '../../common/Nullable'

import FigureImp, { type FigureTemplate, type FigureConstructor, type FigureInnerConstructor } from '../../component/Figure'

import circle from './circle'
import line from './line'
import polygon from './polygon'
import rect from './rect'
import text from './text'
import arc from './arc'
import path from './path'

const figures: Record<string, FigureInnerConstructor> = {}

const extensions = [circle, line, polygon, rect, text, arc, path]
extensions.forEach((figure: FigureTemplate) => {
  figures[figure.name] = FigureImp.extend(figure)
})

function getSupportedFigures (): string[] {
  return Object.keys(figures)
}

function registerFigure<A = unknown, S = unknown> (figure: FigureTemplate<A, S>): void {
  figures[figure.name] = FigureImp.extend(figure)
}

function getInnerFigureClass (name: string): Nullable<FigureInnerConstructor> {
  return figures[name] ?? null
}

function getFigureClass<A = unknown, S = unknown> (name: string): Nullable<FigureConstructor<A, S>> {
  return figures[name] ?? null
}

export { getSupportedFigures, getFigureClass, getInnerFigureClass, registerFigure }
