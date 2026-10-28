import { useEffect, useRef, useState } from 'react'
import { KINDS, findDuplicate, slugify, validName, type Kind, type KItem, validHttpUrl } from '../../shared/knowledge.ts'
import { localDay } from '../../shared/week.ts'
import { Select } from '../shell/Select.tsx'
import { ConfirmButton } from '../shell/ConfirmButton.tsx'
import { t } from '../../shared/i18n.ts'

const NEW = '\u0000new'
const msg = (e: unknown): string => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
const today = (): string => localDay(new Date())
export const blankItem = (url = '', memo = ''): KItem => ({ category: '', slug: '', title: '', kind: '', source: '', url, tags: [], summary: '', added: today(), by: '나', points: '', uses: '', memo, error: null }) // i18n-ok — by 는 파일에 쓰는 값

// 고치기 · 새로 쓰기. prev 가 있으면 고치기(분류 · 이름이 바뀌어도 main 이 옮긴다)
export function ItemForm({ item, prev, pdf, items, categories, ask, onChange, onSaved, onCancel, onOpen }: {
  item: KItem; prev: { category: string; slug: string } | null; pdf?: string; items: KItem[]; categories: string[]
  ask: boolean // 처음부터 쓰던 자료(AI 초안 · 이어 쓰기)면 '취소'를 한 번 더 묻는다
  onChange: (draft: KItem) => void // 쓰는 중인 글(다른 데로 가도 이어 쓰게)
  onSaved: (saved: KItem) => void; onCancel: () => void; onOpen: (key: string) => void
}) {
  const [f, setF] = useState(item)
  const [tags, setTags] = useState(item.tags.join(', '))
  const known = categories.includes(item.category)
  const [cat, setCat] = useState(known ? item.category : NEW)
  const [newCat, setNewCat] = useState(known ? '' : item.category)
  const [err, setErr] = useState('')
  const [dup, setDup] = useState<KItem | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<KItem>): void => { setF(s => ({ ...s, ...p })); setDup(null) }
  const draft = { ...f, tags: tags.split(',').map(s => s.trim()).filter(Boolean), category: (cat === NEW ? newCat : cat).trim() }
  const sig = JSON.stringify([draft, tags])
  const [start] = useState(sig)
  const touched = useRef(false)
  if (sig !== start) touched.current = true // 손대기 전엔 쓰던 자료가 아니다
  useEffect(() => { if (touched.current) onChange(draft) }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps
  const exceptKey = prev ? `${prev.category}/${prev.slug}` : undefined

  const save = async (force: boolean): Promise<void> => {
    const category = (cat === NEW ? newCat : cat).trim()
    const title = f.title.trim(), source = f.source.trim(), summary = f.summary.trim()
    if (!title) return setErr(t('제목을 적어 주세요'))
    if (!f.kind) return setErr(t('종류를 골라 주세요'))
    if (!source) return setErr(t('출처를 적어 주세요'))
    if (!summary) return setErr(t('요약을 적어 주세요'))
    if (!validName(category)) return setErr(t('분류 이름이 올바르지 않습니다 (비우거나 / \\ : 를 쓸 수 없습니다)'))
    if (f.url.trim() && !validHttpUrl(f.url.trim())) return setErr(t('주소는 http:// 나 https:// 로 시작하는 웹 주소여야 합니다(예: https://example.com/…)'))
    const d = force ? null : findDuplicate(items, { url: f.url, title }, exceptKey)
    if (d) { setErr(''); return setDup(d) }
    setBusy(true); setErr('')
    try {
      const t = tags.split(',').map(s => s.trim()).filter(Boolean)
      const saved = await window.api.knowledge.save({ ...f, category, title, source, summary, url: f.url.trim(), tags: t, slug: f.slug || slugify(title) }, prev, pdf)
      onSaved(saved)
    } catch (e) { setErr(msg(e)) } finally { setBusy(false) }
  }

  const field = (label: string, el: React.ReactNode) => <div className="kf-row"><label className="kf-l">{label}</label><div className="kf-v">{el}</div></div>
  const input = (label: string, v: string, on: (s: string) => void, extra: Record<string, unknown> = {}) =>
    field(label, <input className="field" aria-label={label} value={v} onChange={e => on(e.target.value)} {...extra} />)
  return (
    <section className="kform" aria-label={prev ? t('자료 고치기') : t('자료 추가')}>
      <h2>{prev ? t('자료 고치기') : t('자료 추가')}</h2>
      {input(t('제목'), f.title, v => set({ title: v }), { maxLength: 200, autoFocus: true })}
      {field(t('종류'), <Select label={t('종류')} value={f.kind} onChange={v => set({ kind: v as Kind | '' })}
        options={[{ value: '', label: t('고르기'), disabled: true }, ...KINDS.map(k => ({ value: k as Kind | '', label: t(k) }))]} />)}
      {field(t('분류'), (
        <div className="kf-cat">
          {categories.length > 0 && <Select label={t('분류')} value={cat} onChange={v => { setCat(v); setDup(null) }}
            options={[...categories.map(c => ({ value: c, label: c })), { value: NEW, label: t('새 분류…') }]} />}
          {cat === NEW && <input className="field" aria-label={t('새 분류 이름')} placeholder={t('새 분류 이름')} value={newCat} maxLength={80} onChange={e => setNewCat(e.target.value)} />}
          {prev && <p className="muted">{t('분류를 바꾸면 그 분류로 옮겨집니다')}</p>}
        </div>
      ))}
      {input(t('출처'), f.source, v => set({ source: v }), { maxLength: 300, placeholder: t('저자 · 연도 · 제목 · 쪽') })}
      {input(t('주소'), f.url, v => set({ url: v }), { maxLength: 2000, placeholder: 'https://…' })}
      {f.file && field(t('원문'), <span>{f.file}</span>)}
      {!prev && pdf && field(t('원문'), <span>{t('원문 PDF 를 함께 저장합니다')}</span>)}
      {input(t('태그'), tags, setTags, { placeholder: t('쉼표로 나눔 (8개까지)') })}
      {field(t('요약'), <textarea className="field kf-ta" aria-label={t('요약')} rows={2} maxLength={500} value={f.summary} onChange={e => set({ summary: e.target.value.replace(/\s*[\r\n]+\s*/g, ' ') })} />)}
      {field(t('핵심 내용'), <textarea className="field kf-ta" aria-label={t('핵심 내용')} rows={8} value={f.points} onChange={e => set({ points: e.target.value })} />)}
      {field(t('메모'), <textarea className="field kf-ta" aria-label={t('메모')} rows={4} value={f.memo} onChange={e => set({ memo: e.target.value })} />)}
      {f.uses && field(t('쓰인 곳'), <pre className="kf-uses">{f.uses}</pre>)}
      {dup && (
        <p className="warn" role="alert">
          {t("같은 출처가 이미 있습니다: '{title}'", { title: dup.title || dup.slug })}
          <button type="button" className="btn" onClick={() => onOpen(`${dup.category}/${dup.slug}`)}>{t('그 항목 열기')}</button>
          <button type="button" className="btn" disabled={busy} onClick={() => void save(true)}>{t('그래도 저장')}</button>
        </p>
      )}
      {err && <p className="err" role="alert">{err}</p>}
      <div className="kform-actions">
        <ConfirmButton ask={ask || touched.current} confirm={t('정말 버리기')} onConfirm={onCancel}>{t('취소')}</ConfirmButton>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save(false)}>{t('저장')}</button>
      </div>
    </section>
  )
}
