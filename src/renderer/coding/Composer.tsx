import { forwardRef, useEffect, useState, type KeyboardEvent } from 'react'
import { Select } from '../shell/Select.tsx'
import { ArrowUp, LoaderCircle } from 'lucide-react'
import { LANGS, LANG_LABEL, type Lang, type Problem, type Site } from '../../shared/types.ts'
import { t } from '../../shared/i18n.ts'

type Fail = { reason: string; site?: Site; url?: string; message: string }

const AI_NAME: Record<string, string> = { claude: 'Claude Code', codex: 'Codex' }

export const Composer = forwardRef<HTMLTextAreaElement, { onSettings: () => void; onOpen: (p: Problem) => void }>(function Composer({ onSettings, onOpen }, ref) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<Fail | null>(null)
  const [note, setNote] = useState('')
  const [lang, setLang] = useState<Lang>('python3')
  const [ai, setAi] = useState(() => t('AI 없음'))

  useEffect(() => {
    window.api.settings.all().then(s => {
      setLang(s['coding.lang'])
      setAi(s['ai.cli'] ? `${AI_NAME[s['ai.cli']] ?? s['ai.cli']}${s['ai.model'] ? ` · ${s['ai.model']}` : ''}` : t('AI 없음'))
    }).catch(e => console.error('설정을 읽지 못했습니다', e))
  }, [])

  const send = async (text = url): Promise<void> => {
    const u = text.trim()
    if (!u || busy) return
    setBusy(true); setFail(null); setNote('')
    try {
      const r = await window.api.coding.import(u)
      if (r.ok) {
        if (r.existed) { setNote(t('이미 가져온 문제입니다')); await new Promise(res => setTimeout(res, 800)) }
        setUrl('')
        onOpen(r.problem)
      } else setFail(r)
    } catch (e) {
      setFail({ reason: 'fetch-failed', message: e instanceof Error ? e.message : String(e) })
    } finally { setBusy(false); setNote('') }
  }

  const login = async (site: Site): Promise<void> => {
    setBusy(true)
    try { await window.api.coding.login(site) } catch (e) {
      console.error(e)
      setBusy(false)
      setFail({ reason: 'fetch-failed', message: t('로그인 창을 열지 못했습니다') })
      return
    }
    setBusy(false)
    await send()
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() }
  }

  return (
    <div className="composer-wrap">
      <div className="composer">
        <div className="composer-chips">
          <span className="chip">Programmers · LeetCode</span>
          <Select variant="chip" label={t('언어')} value={lang} options={LANGS.map(l => ({ value: l, label: LANG_LABEL[l] }))} onChange={l => { setLang(l); void window.api.settings.set('coding.lang', l) }} />
        </div>
        <textarea ref={ref} rows={2} value={url} placeholder={t('문제 주소를 붙여 넣으세요')} aria-label={t('문제 주소')} onChange={e => { setUrl(e.target.value); setFail(null) }} onKeyDown={onKey} />
        <div className="composer-bottom">
          <button type="button" className="chip" onClick={onSettings}>{ai}</button>
          <span className="muted composer-status" role="status">{note || (busy ? t('가져오는 중…') : '')}</span>
          <button type="button" className="send" aria-label={t('가져오기')} disabled={busy || !url.trim()} onClick={() => void send()}>
            {busy ? <LoaderCircle size={18} className="spin" aria-hidden /> : <ArrowUp size={18} aria-hidden />}
          </button>
        </div>
      </div>
      {fail && (
        <p className="err" role="alert">
          {fail.reason === 'need-login' && fail.site
            ? <>{fail.message} <button type="button" className="btn" onClick={() => void login(fail.site!)}>{t('로그인 창 열기')}</button></>
            : fail.reason === 'parse-failed' && fail.url
              ? <>{fail.message} <a href={fail.url} target="_blank" rel="noreferrer">{t('원본 열기')}</a></>
              : fail.message}
        </p>
      )}
    </div>
  )
})
