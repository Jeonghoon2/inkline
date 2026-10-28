import type { KeyboardEvent } from 'react'
import type { KItem } from '../../shared/knowledge.ts'
import { t } from '../../shared/i18n.ts'

export const usesCount = (i: KItem): number => i.uses.split('\n').filter(l => /^\s*- /.test(l)).length

export function ItemCard({ item, onOpen }: { item: KItem; onOpen: () => void }) {
  const key = (e: KeyboardEvent): void => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }
  const n = usesCount(item)
  return (
    <article className="kcard" role="button" tabIndex={0} onClick={onOpen} onKeyDown={key}>
      <div className="kcard-head">
        {item.error ? <span className="chip kerr">{t('형식 오류: {error}', { error: t(item.error) })}</span> : <span className="chip">{t(item.kind)}</span>}
        {n > 0 && <span className="kcard-uses">{t('쓰인 곳 {n}', { n })}</span>}
      </div>
      <h3>{item.title || item.slug}</h3>
      {item.source && <p className="kcard-src">{item.source}</p>}
      {item.summary && <p className="kcard-sum">{item.summary}</p>}
      {item.tags.length > 0 && <div className="kcard-tags">{item.tags.map(tag => <span key={tag} className="chip">{tag}</span>)}</div>}
    </article>
  )
}
