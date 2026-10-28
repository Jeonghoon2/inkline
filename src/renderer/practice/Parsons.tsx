import { useMemo, useState } from 'react'
import { ArrowRight, RotateCcw, X } from 'lucide-react'
import { checkParsons, movePiece, shuffleOrder } from '../../shared/parsons.ts'
import { t } from '../../shared/i18n.ts'

const MIME = 'application/x-inkline-parsons'
// 모든 조각이 함께 가진 앞쪽 들여쓰기는 보여 줄 때만 뗀다 (확인은 원래 글자로)
function dedent(lines: string[]): string[] {
  const ind = lines.filter(l => l.trim()).map(l => /^[ \t]*/.exec(l)![0].length)
  const n = ind.length ? Math.min(...ind) : 0
  return lines.map(l => l.slice(Math.min(n, /^[ \t]*/.exec(l)![0].length)))
}

export function Parsons({ blocks, distractors, seed }: { blocks: string[]; distractors: string[]; seed: number }) {
  const all = useMemo(() => [...blocks, ...distractors], [blocks, distractors])
  const shown = useMemo(() => dedent(all), [all])
  const order = useMemo(() => shuffleOrder(all.length, seed), [all.length, seed])
  const [placed, setPlaced] = useState<number[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const pool = order.filter(i => !placed.includes(i))
  const put = (i: number, before: number | null = null): void => { setMsg(null); setPlaced(p => movePiece(p, i, before)) }
  const drop = (i: number): void => { setMsg(null); setPlaced(p => p.filter(x => x !== i)) }
  const onDrop = (e: React.DragEvent, to: 'mine' | 'pool', before: number | null): void => {
    e.preventDefault(); e.stopPropagation()
    const i = Number(e.dataTransfer.getData(MIME))
    if (!Number.isInteger(i) || i < 0 || i >= all.length) return
    if (to === 'pool') drop(i); else put(i, before)
  }
  const check = (): void => {
    const r = checkParsons(placed, blocks, distractors)
    setMsg(r.ok ? { ok: true, text: t('맞았습니다 — 이 순서를 바탕으로 직접 코드를 써 보세요') }
      : { ok: false, text: r.kind === 'distractor' ? t('쓰지 않는 조각이 있습니다') : t('{n}번째 줄을 다시 보세요', { n: r.pos }) })
  }
  const piece = (i: number, add: boolean) => (
    <li key={i} className="parsons-piece" draggable onDragStart={e => e.dataTransfer.setData(MIME, String(i))}
      onDragOver={add ? undefined : e => e.preventDefault()} onDrop={add ? undefined : e => onDrop(e, 'mine', i)}>
      <pre>{shown[i]}</pre>
      <button type="button" className="btn parsons-btn" aria-label={add ? t('넣기: {line}', { line: all[i].trim() || t('빈 줄') }) : t('빼기: {line}', { line: all[i].trim() || t('빈 줄') })} onClick={() => add ? put(i) : drop(i)}>
        {add ? <ArrowRight size={14} aria-hidden /> : <X size={14} aria-hidden />}
      </button>
    </li>
  )
  return (
    <div className="parsons">
      <div className="parsons-cols">
        <div><h4>{t('조각')}</h4><ul className="parsons-list" aria-label={t('조각')} onDragOver={e => e.preventDefault()} onDrop={e => onDrop(e, 'pool', null)}>{pool.map(i => piece(i, true))}</ul></div>
        <div><h4>{t('내 순서')}</h4>
          <ul className="parsons-list" aria-label={t('내 순서')} onDragOver={e => e.preventDefault()} onDrop={e => onDrop(e, 'mine', null)}>
            {placed.map(i => piece(i, false))}
            {!placed.length && <li className="muted parsons-empty">{t('조각을 끌어 오거나 넣기를 누르세요')}</li>}
          </ul>
        </div>
      </div>
      <div className="parsons-actions">
        <button type="button" className="btn btn-primary" disabled={!placed.length} onClick={check}>{t('확인')}</button>
        <button type="button" className="btn" onClick={() => { setPlaced([]); setMsg(null) }}><RotateCcw size={14} aria-hidden /> {t('다시')}</button>
        {msg && <span role="status" className={msg.ok ? 'parsons-ok' : 'err'}>{msg.text}</span>}
      </div>
    </div>
  )
}
