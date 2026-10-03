import { useT } from '../../i18n'
import { demoCopy } from './demoCopy'

export function DemoLinks({ compact = false }: { compact?: boolean }) {
  const t = useT()
  const copy = demoCopy[t.locale]
  return <div className="demo-links">
    <a href={`https://nonogram.com.cn/${t.locale}/#download`} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}>{copy.link} ↗</a>
    {!compact && <p>{copy.storage}</p>}
  </div>
}
