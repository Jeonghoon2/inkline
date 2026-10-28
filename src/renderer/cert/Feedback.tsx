// src/renderer/cert/Feedback.tsx — 제출 뒤 해설(공부 · 오답 노트 · 쌍 비교가 같이 쓴다)
import type { CertFeedback } from '../../shared/cert.ts'
import { t } from '../../shared/i18n.ts'
const MARK = ['①', '②', '③', '④']
export function Feedback({ fb, choices, picked, onPage }: { fb: CertFeedback; choices: string[]; picked: number; onPage: (p: number) => void }) {
  const m = fb.material
  return (
    <div className="cert-fb" role="status">
      {!fb.correct && fb.sure && fb.refute && <p className="cert-refute">{fb.refute}</p>}
      <p className={`cert-result ${fb.correct ? 'ok' : 'bad'}`}>{fb.correct ? t('맞아요.') : t('아쉬워요. 정답은 {mark} {choice} 입니다.', { mark: MARK[fb.answer]!, choice: choices[fb.answer]! })}</p>
      {!fb.correct && fb.notes[picked] && <p><b>{MARK[picked]} {t('고른 보기')}</b> {fb.notes[picked]}</p>}
      <p><b>{t('정답 이유')}</b> {fb.why}</p>
      {m?.explain && <p><b>{t('쉬운 설명')}</b> {m.explain}</p>}
      {m?.mnemonic && <p><b>{t('외우기')}</b> {m.mnemonic}</p>}
      {m?.confusions.length ? <p><b>{t('헷갈리는 항목')}</b> {m.confusions.map(c => `${c.title} — ${c.diff}`).join(' · ')}</p> : null}
      {fb.pair && fb.pair.count >= 2 && <p className="muted">{t("'{a}' 와 '{b}' 를 {n}번 헷갈렸어요 — 헷갈리는 쌍에서 비교해 보세요.", { a: fb.item.title, b: fb.pair.title, n: fb.pair.count })}</p>}
      <details><summary>{t('교재 원문 p.{page}', { page: fb.item.pageFrom })}</summary><p className="cert-quote">{fb.item.body}</p><button type="button" className="btn" onClick={() => onPage(fb.item.pageFrom)}>{t('쪽 전체 보기')}</button></details>
    </div>
  )
}
