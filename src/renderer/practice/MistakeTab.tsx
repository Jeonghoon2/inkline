import { useCallback, useEffect, useState } from 'react'
import { MISTAKE_LABEL, type Mistake } from '../../shared/types.ts'
import { LoadFail } from '../coding/LoadFail.tsx'
import { day } from '../coding/ProblemList.tsx'
import { t } from '../../shared/i18n.ts'

export function MistakeTab({ problemId }: { problemId: number }) {
  const [items, setItems] = useState<Mistake[] | null>(null)
  const [fail, setFail] = useState(false)
  const load = useCallback(() => {
    setFail(false)
    window.api.tutor.mistakes(problemId).then(setItems).catch(e => { console.error('오답 노트를 읽지 못했습니다', e); setFail(true) })
  }, [problemId])
  useEffect(() => { load(); return window.api.tutor.onMistakes(load) }, [load])
  if (fail) return <LoadFail onRetry={load} />
  if (!items) return null
  if (!items.length) return <p className="muted ppanel-empty">{t('아직 쌓인 실수가 없습니다 — 실행이 실패하면 AI 가 실수 유형을 붙여 둡니다')}</p>
  return (
    <ul className="mistake-list">
      {items.map(m => (
        <li key={m.id} className="mistake-item">
          <div><span className="chip">{t(MISTAKE_LABEL[m.type])}</span>{m.line !== null && <span className="muted">{t('줄 {n}', { n: m.line })}</span>}<span className="muted mistake-at">{day(m.at)}</span></div>
          {m.note && <p>{m.note}</p>}
        </li>
      ))}
    </ul>
  )
}
