import { useCallback, useEffect, useState } from 'react'
import { NotebookPen } from 'lucide-react'
import { MISTAKE_LABEL, type MistakeGroup, type ProblemSummary } from '../../shared/types.ts'
import { EmptyState } from '../shell/EmptyState.tsx'
import { relatedProblems } from '../../shared/related.ts'
import { day } from './ProblemList.tsx'
import { LoadFail } from './LoadFail.tsx'
import { t } from '../../shared/i18n.ts'

export function MistakeBook({ onOpen }: { onOpen: (id: number) => void }) {
  const [groups, setGroups] = useState<MistakeGroup[] | null>(null)
  const [rows, setRows] = useState<ProblemSummary[]>([])
  const [passed, setPassed] = useState<Set<number>>(new Set())
  const [fail, setFail] = useState(false)
  const load = useCallback(() => {
    setFail(false)
    const bad = (e: unknown): void => { console.error('오답 노트를 읽지 못했습니다', e); setFail(true) }
    window.api.tutor.mistakeBook().then(setGroups).catch(bad)
    window.api.coding.list().then(setRows).catch(bad)
    window.api.coding.passedIds().then(a => setPassed(new Set(a))).catch(bad)
  }, [])
  useEffect(() => {
    load()
    const off = [window.api.tutor.onMistakes(load), window.api.coding.onChanged(load)]
    return () => off.forEach(f => f())
  }, [load])
  if (fail) return <div className="coding"><LoadFail onRetry={load} /></div>
  if (!groups) return null
  if (!groups.length) return <div className="coding"><EmptyState icon={NotebookPen} title={t('아직 쌓인 실수가 없습니다')}><p className="muted">{t('실행이 실패하면 AI 가 실수 유형을 붙여 둡니다')}</p></EmptyState></div>

  return (
    <div className="coding mistake-book">
      {groups.map(g => {
        const rel = relatedProblems(g.items.map(i => i.problemId), rows, passed)
        return (
          <section key={g.type} className="mistake-group">
            <h3>{t(MISTAKE_LABEL[g.type])} {g.count}</h3>
            <ul className="mistake-list">
              {g.items.map(m => (
                <li key={m.id} className="mistake-item">
                  <button type="button" className="link" onClick={() => onOpen(m.problemId)}>{m.title}</button>
                  <span className="muted mistake-at">{day(m.at)}</span>
                  {m.note && <p>{m.note}</p>}
                </li>
              ))}
            </ul>
            {rel.length > 0 && (
              <p className="mistake-rel"><span className="muted">{t('같은 태그 문제')}</span>
                {rel.map(r => <button key={r.id} type="button" className="link" onClick={() => onOpen(r.id)}>{r.title}</button>)}
              </p>
            )}
          </section>
        )
      })}
    </div>
  )
}
