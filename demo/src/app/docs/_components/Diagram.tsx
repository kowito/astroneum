import fs from 'node:fs'
import path from 'node:path'

import Mermaid from './Mermaid'

const cache = new Map<string, string>()

/** Mermaid source for the diagram tagged `%% diagram: <id>` in docs/<doc>. Read at build time. */
function readDiagram(doc: string, id: string): string {
  const file = path.join(process.cwd(), '..', 'docs', doc)
  let text = cache.get(file)
  if (text === undefined) {
    text = fs.readFileSync(file, 'utf8')
    cache.set(file, text)
  }
  for (const match of text.matchAll(/```mermaid\n([\s\S]*?)```/g)) {
    if (match[1].startsWith(`%% diagram: ${id}\n`)) return match[1]
  }
  throw new Error(`No diagram "${id}" in docs/${doc}. Add "%% diagram: ${id}" as the first line of its mermaid block.`)
}

/**
 * A diagram from the markdown docs, so the website and the GitHub docs share one
 * source. `label` is the text alternative for screen readers; `caption` is shown.
 */
export default function Diagram({ doc, id, label, caption }: { doc: string, id: string, label: string, caption?: string }) {
  return (
    <figure className="dc-diagram">
      <Mermaid code={readDiagram(doc, id)} label={label} />
      {caption !== undefined && <figcaption>{caption}</figcaption>}
    </figure>
  )
}
