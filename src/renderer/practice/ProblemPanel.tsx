import { useMemo, useState } from 'react'
import type { Hint, Problem, Stage } from '../../shared/types.ts'
import { sanitizeProblemHtml } from '../coding/sanitize.ts'
import { HintTab } from './HintTab.tsx'
import { MistakeTab } from './MistakeTab.tsx'
import { t } from '../../shared/i18n.ts'

export const TABS = ['문제', '힌트', '오답 노트'] as const // i18n-ok — 탭 키. 보일 때 t()
export type PanelTab = (typeof TABS)[number]

type HintProps = { attemptId: number; code: string; stage: Stage; hints: Hint[]; loaded: 'loading' | 'ok' | 'fail'; onRetry: () => void; onHints: (f: (h: Hint[]) => Hint[]) => void; onSettings: () => void }

export function ProblemPanel({ p, tab, onTab, hint, fresh, review, tagsOk }: { p: Problem; tab: PanelTab; onTab: (t: PanelTab) => void; hint: HintProps; fresh: boolean; review?: boolean; tagsOk: boolean }) {
  const html = useMemo(() => sanitizeProblemHtml(p.html), [p.html])
  const c = p.classification
  const [reveal, setReveal] = useState(false)
  return (
    <section className="ppanel">
      <div className="ptabs" role="tablist">
        {TABS.filter(k => !review || k === '문제').map(k => <button key={k} type="button" role="tab" aria-selected={k === tab} onClick={() => onTab(k)}>{t(k)}{k === '힌트' && fresh && tab !== '힌트' && <span className="tab-dot" role="img" aria-label={t('새 힌트')} />}</button>)}{/* i18n-ok — 탭 키 비교 */}
      </div>
      <div className="ppanel-body">
        {tab === '문제' ? ( // i18n-ok
          <>
            <p className="problem-meta">
              <a href={p.url} target="_blank" rel="noreferrer">{p.site === 'programmers' ? 'Programmers' : 'LeetCode'}</a>
              {c && <span className="chip">Lv {c.difficulty}</span>}
              {c && !review && (tagsOk || reveal)
                ? c.tags.map(tag => <span key={tag} className="chip">{tag}</span>)
                : c && !review && <button type="button" className="btn btn-sm" onClick={() => setReveal(true)} title={t('유형을 보면 스스로 접근을 떠올리는 연습이 줄어요')}>{t('태그 보기')}</button>}
            </p>
            <div className="problem-body" dangerouslySetInnerHTML={{ __html: html }} />
          </>
        ) : null}
        {/* 힌트를 만드는 중에 탭을 옮겨도 끊기지 않게 계속 마운트 */}
        <div hidden={tab !== '힌트'}><HintTab {...hint} visible={tab === '힌트'} /></div>{/* i18n-ok — 탭 키 */}
        {tab === '오답 노트' && <MistakeTab problemId={p.id} />}{/* i18n-ok — 탭 키 */}
      </div>
    </section>
  )
}
