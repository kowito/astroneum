import CopyButton from '../../components/CopyButton'
import { highlight, type CodeLang } from '../../../docs/highlight'

interface CodeBlockProps {
  code: string
  lang?: CodeLang
  /** File name or short caption shown above the code. */
  title?: string
  /** Hide the copy button (for output that is not meant to be pasted). */
  noCopy?: boolean
}

/** A highlighted, copyable code sample. Works on the server and in client components. */
export default function CodeBlock({ code, lang = 'tsx', title, noCopy = false }: CodeBlockProps) {
  const trimmed = code.replace(/^\n+|\s+$/g, '')
  return (
    <figure className="dc-code">
      {(title !== undefined || !noCopy) && (
        <figcaption>
          <span>{title ?? lang}</span>
          {!noCopy && <CopyButton text={trimmed} />}
        </figcaption>
      )}
      <pre tabIndex={0}><code dangerouslySetInnerHTML={{ __html: highlight(trimmed, lang) }} /></pre>
    </figure>
  )
}
