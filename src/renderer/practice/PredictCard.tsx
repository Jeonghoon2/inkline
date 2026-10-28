import { useState } from 'react'
import { t } from '../../shared/i18n.ts'

export function PredictCard({ args, onDone }: { args: unknown[]; onDone: (text: string) => Promise<void> }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const done = (v: string): void => { setErr(''); onDone(v).catch(() => setErr(t('저장하지 못했습니다'))) }
  return (
    <div className="predict" role="dialog" aria-label={t('결과 예측')} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); done('') } }}>
      <div className="predict-card">
        <h3>{t('예제 1 의 결과를 예측해 보세요')}</h3>
        <p className="muted">{t('입력')}</p>
        <pre className="val">{JSON.stringify(args)}</pre>
        <input className="field" autoFocus value={text} placeholder={t('예: 3')} aria-label={t('예측한 결과')} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) done(text.trim()) }} />
        {err && <p className="err" role="alert">{err}</p>}
        <div className="predict-actions">
          <button type="button" className="btn" onClick={() => done('')}>{t('건너뛰기')}</button>
          <button type="button" className="btn btn-primary" onClick={() => done(text.trim())}>{t('확인')}</button>
        </div>
      </div>
    </div>
  )
}
