import fs from 'node:fs'
import path from 'node:path'

import CodeBlock from './CodeBlock'

/**
 * Shows a real source file from demo/src, read at build time. Used for examples
 * that also run on the page, so the code you read is the code that is running.
 */
export default function SourceCode({ file, title }: { file: string, title?: string }) {
  const text = fs.readFileSync(path.join(process.cwd(), 'src', file), 'utf8')
  const code = text.replace(/^'use client'\n\n?/, '')
  return <CodeBlock code={code} title={title ?? path.basename(file)} />
}
