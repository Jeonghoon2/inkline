import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import type { AiError } from '../../shared/types.ts'
import type { KItem } from '../../shared/knowledge.ts'
import { t } from '../../shared/i18n.ts'

export type AddInput = { url: string; text: string; pdf: string }
type St = { k: 'pick' } | { k: 'busy'; secs: number } | { k: 'err'; error: AiError }
const SETUP = new Set(['no-cli', 'not-installed', 'busy'])

// 주소나 글 → AI 초안. 못 하면 주소만 채운 빈 폼으로
export function AddFlow({ init, onInput, onDraft, onManual, onCancel, onSettings }: { init?: AddInput; onInput: (v: AddInput) => void; onDraft: (i: KItem, pdf?: string) => void; onManual: (url: string, text: string) => void; onCancel: () => void; onSettings: () => void }) {
  const [url, setUrl] = useState(init?.url ?? '')
  const [text, setText] = useState(init?.text ?? '')
  const [pdf, setPdf] = useState(init?.pdf ?? '') // 고르거나 끌어다 놓은 PDF 의 경로
  const typed = useRef(false)
  useEffect(() => { if (typed.current) onInput({ url, text, pdf }); typed.current = true }, [url, text, pdf]) // eslint-disable-line react-hooks/exhaustive-deps -- 탭을 옮겨도 넣던 것을 남긴다
  const [st, setSt] = useState<St>({ k: 'pick' })
  const seq = useRef(0)
  useEffect(() => () => { seq.current++; void window.api.knowledge.cancelDraft() }, [])
  useEffect(() => {
    if (st.k !== 'busy') return
    const t = setInterval(() => setSt(s => (s.k === 'busy' ? { k: 'busy', secs: s.secs + 1 } : s)), 1000)
    return () => clearInterval(t)
  }, [st.k])

  const make = async (): Promise<void> => {
    const n = ++seq.current
    setSt({ k: 'busy', secs: 0 })
    const r = await window.api.knowledge.draft({ url: url.trim(), text, ...(pdf ? { pdfPath: pdf } : {}) }).catch((e: unknown) => ({ ok: false as const, error: { code: 'cli-error' as const, message: (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') } }))
    if (n !== seq.current) return
    if (!r.ok) return setSt(r.error.code === 'aborted' ? { k: 'pick' } : { k: 'err', error: r.error })
    onDraft(r.item, r.pdf)
  }
  const pick = async (): Promise<void> => { const p = await window.api.knowledge.pickPdf().catch(() => null); if (p) setPdf(p) }
  const drop = (e: React.DragEvent): void => {
    e.preventDefault()
    const f = [...e.dataTransfer.files].find(x => /\.pdf$/i.test(x.name))
    if (f) setPdf(window.api.knowledge.pathForFile(f))
  }
  const isPdf = !!pdf || /\.pdf(\?|#|$)/i.test(url.trim())
  const has = !!url.trim() || !!text.trim() || !!pdf

  return (
    <section className="kform" aria-label={t('자료 추가')} onDragOver={e => e.preventDefault()} onDrop={drop}>
      <h2>{t('자료 추가')}</h2>
      {st.k === 'busy' ? (
        <p className="kwait" role="status">
          <LoaderCircle size={16} className="spin" aria-hidden /> {isPdf ? t('PDF 를 읽고 AI 가 정리하는 중…') : t('AI 가 정리하는 중…')} {t('{n}초', { n: st.secs })}
          <button type="button" className="btn" onClick={() => { void window.api.knowledge.cancelDraft() }}>{t('취소')}</button>
        </p>
      ) : (
        <>
          <div className="kf-row"><label className="kf-l" htmlFor="k-url">{t('주소')}</label><div className="kf-v"><input id="k-url" className="field" autoFocus placeholder={t('https://… (PDF 주소도 됩니다)')} value={url} onChange={e => setUrl(e.target.value)} /></div></div>
          <div className="kf-row"><span className="kf-l">PDF</span><div className="kf-v">
            <button type="button" className="btn" onClick={() => void pick()}>{t('PDF 파일 고르기')}</button>{' '}
            {pdf ? <span>{pdf.split(/[\\/]/).pop()} <button type="button" className="btn" aria-label={t('PDF 지우기')} onClick={() => setPdf('')}>×</button></span> : <span className="muted">{t('또는 이 창에 PDF 를 끌어다 놓기')}</span>}
          </div></div>
          <div className="kf-row"><label className="kf-l" htmlFor="k-text">{t('글')}</label><div className="kf-v"><textarea id="k-text" className="field kf-ta" rows={8} placeholder={t('초록 · 메모를 붙여 넣기 (주소만 넣어도 됩니다)')} value={text} onChange={e => setText(e.target.value)} /></div></div>
          {st.k === 'err' && <p className="err" role="alert">{st.error.message} {SETUP.has(st.error.code) && <button type="button" className="btn" onClick={onSettings}>{t('환경설정')}</button>}</p>}
          <div className="kform-actions">
            <button type="button" className="btn" onClick={onCancel}>{t('취소')}</button>
            <button type="button" className={st.k === 'err' ? 'btn btn-primary' : 'btn'} onClick={() => onManual(url.trim(), text.trim())}>{t('직접 쓰기')}</button>
            {st.k === 'err'
              ? <button type="button" className="btn" disabled={!has} onClick={() => void make()}>{t('다시 시도')}</button>
              : <button type="button" className="btn btn-primary" disabled={!has} onClick={() => void make()}>{t('AI 로 초안 만들기')}</button>}
          </div>
        </>
      )}
    </section>
  )
}
