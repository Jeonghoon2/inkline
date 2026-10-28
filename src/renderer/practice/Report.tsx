import { STAGES, STAGE_LABEL, type SessionReport } from '../../shared/types.ts'
import { FIELDS } from './AfterPass.tsx'
import { dueLabel } from '../../shared/review.ts'
import { locale, t } from '../../shared/i18n.ts'

const dur = (ms: number): string => {
  const s = Math.round(ms / 1000)
  return s < 60 ? t('{s}초', { s }) : t('{m}분 {s}초', { m: Math.floor(s / 60), s: s % 60 })
}

export function Report({ report: r, title, home, onDone }: { report: SessionReport; title: string; home: boolean; onDone: () => void }) {
  const max = Math.max(1, ...STAGES.map(s => r.stageMs[s] ?? 0))
  const hints = r.hints.filter(h => h.level >= 1)
  const pct = (ms: number): number => (r.totalMs > 0 ? Math.min(100, Math.max(0, (ms / r.totalMs) * 100)) : 0)
  const total = r.totalMs < 60_000 ? dur(r.totalMs) : t('{m}분', { m: Math.round(r.totalMs / 60_000) })
  const prev = r.previous
  const prevRef = prev?.reflection ? FIELDS.filter(f => prev.reflection![f.key]?.trim()) : []
  const prevDate = prev ? new Date(prev.at) : null
  return (
    <div className="after">
      <section className="after-card report" aria-label={t('리포트')}>
        <header>
          <h2>{title}</h2>
          <p className="muted">{r.mode === 'review' ? t('복습 리포트') : t('풀이 리포트')} · {t('푼 시간 {time}', { time: total })} <span title={t('입력 · 실행이 없던 시간은 빼고 센 시간')}>{t('(멈춘 시간 뺌)')}</span></p>
        </header>
        <div className="rep-bars">
          {STAGES.map(s => (
            <div key={s} className="rep-row">
              <span>{t(STAGE_LABEL[s])}</span>
              <div className="rep-track"><div className="rep-fill" style={{ width: `${((r.stageMs[s] ?? 0) / max) * 100}%` }} /></div>
              <span className="rep-val">{dur(r.stageMs[s] ?? 0)}</span>
            </div>
          ))}
        </div>
        <div>
          <p className="muted rep-label">{t('힌트를 쓴 시점')}</p>
          {hints.length === 0 ? <p>{t('힌트 없이 풀었습니다')}</p> : (
            <div className="rep-axis">
              {hints.map((h, i) => <span key={i} className="rep-tick" style={{ left: `${pct(h.atMs)}%` }}><i />L{h.level}</span>)}
            </div>
          )}
        </div>
        <p className="rep-nums">
          <span>{t('실행 {n}번', { n: r.runs })}</span>
          <span title={t('문제를 처음 연 때부터 예제를 처음 모두 통과할 때까지(쉰 시간 포함)')}>{t('처음 연 뒤 첫 통과까지 {time}', { time: r.firstPassMs === null ? '-' : dur(r.firstPassMs) })}</span>
          <span>{t('예측 {result}', { result: r.predictedRight === null ? t('안 함') : r.predictedRight ? t('맞음') : t('틀림') })}</span>
          <span>{t('이론 학습 {result}', { result: r.theory ? (r.theory.approach ? `· ${r.theory.approach.name}` : t('봄')) : t('안 봄') })}</span>
        </p>
        {prev && prevDate && (prevRef.length > 0 || prev.selfExplains.length > 0 || prev.theory?.approach) && (
          <div aria-label={t('지난번의 나')}>
            <p className="muted rep-label">{t('지난번의 나')} · {prevDate.getMonth() + 1}.{prevDate.getDate()}</p>
            {prevRef.map(f => <p key={f.key}><strong>{t(f.label)}</strong> {prev.reflection![f.key]}</p>)}
            {prev.theory?.approach && <p><strong>{t('고른 접근')}</strong> {prev.theory.approach.name}</p>}
            {prev.selfExplains.length > 0 && <ul>{prev.selfExplains.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          </div>
        )}
        {r.next === 'mastered' && <p>{t('익혔습니다 — 더 복습하지 않아도 됩니다')}</p>}
        {r.next && r.next !== 'mastered' && (() => {
          const d = new Date(r.next.dueAt)
          return <p>{t('다음 복습 {due} ({date})', { due: t(dueLabel(r.next.dueAt, new Date())), date: d.toLocaleDateString(locale(), { month: 'long', day: 'numeric' }) })}</p>
        })()}
        <div className="after-actions"><button type="button" className="btn btn-primary" onClick={onDone}>{home ? t('홈으로') : t('목록으로')}</button></div>
      </section>
    </div>
  )
}
