import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Library, Plus } from 'lucide-react'
import { KINDS, type KItem, type KnowledgeData } from '../../shared/knowledge.ts'
import { EmptyState } from '../shell/EmptyState.tsx'
import { ItemCard } from '../knowledge/ItemCard.tsx'
import { ItemDetail } from '../knowledge/ItemDetail.tsx'
import { ItemForm, blankItem } from '../knowledge/ItemForm.tsx'
import { AddFlow, type AddInput } from '../knowledge/AddFlow.tsx'
import { t } from '../../shared/i18n.ts'

type View =
  | { k: 'list' }
  | { k: 'item'; key: string }
  | { k: 'add' }
  | { k: 'form'; item: KItem; prev: { category: string; slug: string } | null; pdf?: string }

type Form = { item: KItem; prev: { category: string; slug: string } | null; pdf?: string }
type Draft = Form | { add: AddInput } // 폼에 쓰던 글, 또는 자료 추가에 넣던 주소 · 글 · PDF
let draft: Draft | null = null // 쓰던 자료 — 탭을 오가도 앱이 켜져 있는 동안 기억
const same = (i: KItem): boolean => !!draft && 'prev' in draft && !!draft.prev && draft.prev.category === i.category && draft.prev.slug === i.slug // 이 글을 고치던 초안인가
const resume = (d: Draft): View => ('add' in d ? { k: 'add' } : { k: 'form', ...d })

const keyOf = (i: KItem): string => `${i.category}/${i.slug}`
const hay = (i: KItem): string => [i.title, i.source, i.tags.join(' '), i.summary, i.points].join('\n').toLowerCase()

export function KnowledgeTab({ side, onSettings, request }: { side: HTMLElement | null; onSettings: () => void; request: { key: string; n: number } | null }) {
  const [data, setData] = useState<KnowledgeData | null>(null)
  const [error, setError] = useState('')
  const [view, setView] = useState<View>(request ? { k: 'item', key: request.key } : { k: 'list' }) // 없는 항목이면 아래 효과가 목록으로 돌린다
  const [cat, setCat] = useState<string | null>(null)
  const [kind, setKind] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const search = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let live = true
    const load = (): void => {
      window.api.knowledge.load().then(d => { if (live) { setData(d); setError('') } })
        .catch(e => live && setError(t('지식사전을 읽지 못했습니다: {err}', { err: e instanceof Error ? e.message : String(e) })))
    }
    load()
    const off = window.api.history.onChanged(load)
    return () => { live = false; off() }
  }, [])

  useEffect(() => { if (request) setView({ k: 'item', key: request.key }) }, [request?.n]) // eslint-disable-line react-hooks/exhaustive-deps

  const items = data?.items ?? []
  const cur = view.k === 'item' ? items.find(i => keyOf(i) === view.key) : undefined
  // 열어 둔 항목이 사라지면(지움 · 옮김) 목록으로
  useEffect(() => { if (data && view.k === 'item' && !cur) setView({ k: 'list' }) }, [data, view, cur])
  // 고른 분류가 사라지면(마지막 항목을 옮기거나 지움) 전체로
  useEffect(() => { if (cat && data && !data.categories.includes(cat)) setCat(null) }, [data, cat])

  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.isComposing || view.k !== 'list' || (e.target as Element).closest?.('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      search.current?.focus()
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [view.k])

  const inCat = useMemo(() => items.filter(i => !cat || i.category === cat), [items, cat])
  const kindCount = (k: string): number => inCat.filter(i => i.kind === k).length
  const catCount = (c: string): number => items.filter(i => i.category === c).length
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return inCat.filter(i => (!kind || i.kind === kind) && (!s || hay(i).includes(s)))
      .sort((a, b) => b.added.localeCompare(a.added) || a.title.localeCompare(b.title, 'ko'))
  }, [inCat, kind, q])

  const reload = async (): Promise<void> => { setData(await window.api.knowledge.load()) }
  const sidebar = data && (
    <>
      <button type="button" className="side-item" aria-current={!cat && !kind} onClick={() => { setCat(null); setKind(null); setQ(''); setView({ k: 'list' }) }}>
        <span>{t('전체')}</span><span className="num">{items.length}</span>
      </button>
      {data.categories.length > 0 && <div className="side-label">{t('분류')}</div>}
      {data.categories.map(c => (
        <button key={c} type="button" className="side-item" aria-current={cat === c} onClick={() => { setCat(cat === c ? null : c); setView({ k: 'list' }) }}>
          <span className="side-title">{c}</span><span className="num">{catCount(c)}</span>
        </button>
      ))}
      <div className="side-label">{t('종류')}</div>
      {KINDS.map(k => (
        <button key={k} type="button" className="side-item" aria-current={kind === k} onClick={() => { setKind(kind === k ? null : k); setView({ k: 'list' }) }}>
          <span>{t(k)}</span><span className="num">{kindCount(k)}</span>
        </button>
      ))}
    </>
  )

  if (!data) return <div className="history">{error && <p className="err" role="alert">{error}</p>}</div>

  const add = (): void => setView({ k: 'add' })
  let body
  if (view.k === 'add')
    body = <AddFlow onSettings={onSettings} init={draft && 'add' in draft ? draft.add : undefined}
      onInput={v => { if (!draft || 'add' in draft) draft = v.url.trim() || v.text.trim() || v.pdf ? { add: v } : null }} // 폼에 쓰던 자료(AI 초안 등)는 덮지 않는다
      onCancel={() => { if (draft && 'add' in draft) draft = null; setView({ k: 'list' }) }}
      onDraft={(item, pdf) => { draft = { item, prev: null, pdf }; setView({ k: 'form', item, prev: null, pdf }) }} // AI 초안은 오는 순간 쓰던 자료
      onManual={(url, text) => { const item = blankItem(url, text); draft = url || text ? { item, prev: null } : null; setView({ k: 'form', item, prev: null }) }} />
  else if (view.k === 'form')
    body = <ItemForm item={view.item} prev={view.prev} pdf={view.pdf} items={items} categories={data.categories} ask={!!draft}
      onChange={item => { draft = { item, prev: view.prev, pdf: view.pdf } }}
      onCancel={() => { draft = null; setView(view.prev ? { k: 'item', key: `${view.prev.category}/${view.prev.slug}` } : { k: 'list' }) }}
      onOpen={key => setView({ k: 'item', key })}
      onSaved={s => { draft = null; void reload().then(() => setView({ k: 'item', key: keyOf(s) })) }} />
  else if (cur)
    body = <ItemDetail item={cur} onBack={() => setView({ k: 'list' })} onEdit={() => { if (same(cur)) setView(resume(draft!)); else { draft = null; setView({ k: 'form', item: cur, prev: { category: cur.category, slug: cur.slug } }) } }} onRemoved={() => { if (same(cur)) draft = null; setView({ k: 'list' }); void reload() }} />
  else if (!data.exists)
    body = <EmptyState icon={Library} title={t('지식사전이 비어 있습니다')}><button type="button" className="btn btn-primary" onClick={add}><Plus size={14} aria-hidden /> {t('자료 추가')}</button></EmptyState>
  else
    body = (
      <>
        {draft && (
          <p className="warn" role="status">{t('쓰던 자료가 있습니다 —')}{' '}
            <button type="button" className="btn" onClick={() => setView(resume(draft!))}>{t('이어 쓰기')}</button>{' '}
            <button type="button" className="btn" onClick={() => { draft = null; setView({ k: 'list' }) }}>{t('버리기')}</button>
          </p>
        )}
        <div className="ktop">
          <label className="sr" htmlFor="k-q">{t('검색')}</label>
          <input id="k-q" ref={search} type="search" placeholder={t('검색 — 제목·출처·태그·요약·내용  ( / )')} aria-keyshortcuts="/" value={q} onChange={e => setQ(e.target.value)} />
          <button type="button" className="btn btn-primary" onClick={add}><Plus size={14} aria-hidden /> {t('자료 추가')}</button>
        </div>
        {shown.length
          ? <div className="klist">{shown.map(i => <ItemCard key={keyOf(i)} item={i} onOpen={() => setView({ k: 'item', key: keyOf(i) })} />)}</div>
          : <div className="h-none">{t('조건에 맞는 자료가 없습니다')}{(cat || kind || q) && <> <button type="button" className="btn" onClick={() => { setCat(null); setKind(null); setQ('') }}>{t('거르기 모두 풀기')}</button></>}</div>}
      </>
    )

  return (
    <>
      {side && sidebar && createPortal(sidebar, side)}
      <div className="history knowledge">
        {error && <p className="err" role="alert">{error}</p>}
        {body}
      </div>
    </>
  )
}
