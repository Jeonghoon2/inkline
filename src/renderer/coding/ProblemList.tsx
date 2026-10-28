import type { ProblemStatus, ProblemSummary } from '../../shared/types.ts'
import { dueLabel, statusLabel } from '../../shared/review.ts'
import { t } from '../../shared/i18n.ts'

export const day = (iso: string): string => { const d = new Date(iso); return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` }

// statusLabel 은 한국어 표지를 돌려준다 — 화면에는 낱말을 옮겨 보인다
const label = (s: ProblemStatus, now: Date): string => s.kind === 'review' ? t('복습 {due}', { due: t(dueLabel(s.dueAt, now)) }) : t(statusLabel(s, now))

const shown = (s?: ProblemStatus): boolean => !!s && (s.kind === 'passed' || s.kind === 'review' || s.kind === 'mastered')

export function ProblemList({ rows, statuses, onOpen }: { rows: ProblemSummary[]; statuses: Record<number, ProblemStatus>; onOpen: (id: number, mode: 'learn' | 'review') => void }) {
  if (!rows.length) return <p className="muted problem-none">{t('조건에 맞는 문제가 없습니다')}</p>
  return (
    <table className="problem-table">
      <thead><tr><th>{t('제목')}</th><th>{t('상태')}</th><th>{t('난이도')}</th><th>{t('태그')}</th><th>{t('가져온 날')}</th></tr></thead>
      <tbody>
        {rows.map(p => (
          <tr key={p.id} role="button" tabIndex={0} onClick={() => onOpen(p.id, 'learn')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(p.id, 'learn') } }}>
            <td><span className="chip site" aria-label={p.site === 'programmers' ? 'Programmers' : 'LeetCode'}>{p.site === 'programmers' ? 'P' : 'L'}</span>{p.title}</td>
            <td>{label(statuses[p.id] ?? { kind: 'new' }, new Date()) || '—'}{statuses[p.id]?.kind === 'review' && statusLabel(statuses[p.id], new Date()) === '복습 오늘' && ( // i18n-ok — shared/review.ts 의 표지와 비교
              <button type="button" className="btn btn-sm" onClick={e => { e.stopPropagation(); onOpen(p.id, 'review') }} onKeyDown={e => e.stopPropagation()}>{t('복습')}</button>
            )}</td>
            <td>{p.classification ? `Lv ${p.classification.difficulty}` : '—'}</td>
            <td>{shown(statuses[p.id]) ? p.classification?.tags.map(tag => <span key={tag} className="chip">{tag}</span>) : <span className="muted" title={t('한 번 통과하면 보여요')}>—</span>}</td>
            <td className="muted">{day(p.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
