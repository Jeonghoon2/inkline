// Parsons 조각 번호: 0..blocks-1 = 정답 줄(정답 순서), 그 뒤는 오답 조각
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 씨앗이 같으면 같은 순서 (Fisher-Yates) */
export function shuffleOrder(count: number, seed: number): number[] {
  const r = mulberry32(seed), a = Array.from({ length: count }, (_, i) => i)
  for (let i = count - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  if (count >= 2 && a.every((v, i) => v === i)) a.push(a.shift()!) // 정답 순서 그대로 나오면 한 칸 민다
  return a
}

export type ParsonsCheck = { ok: true } | { ok: false; kind: 'distractor' } | { ok: false; kind: 'mismatch'; pos: number }

/** placed: 쌓은 조각 번호. 글자가 같은 줄은 서로 바꿔 써도 된다 */
export function checkParsons(placed: number[], blocks: string[], distractors: string[]): ParsonsCheck {
  const all = [...blocks, ...distractors]
  if (placed.some(i => i >= blocks.length)) return { ok: false, kind: 'distractor' }
  for (let i = 0; i < Math.max(placed.length, blocks.length); i++) {
    if (all[placed[i]] !== blocks[i]) return { ok: false, kind: 'mismatch', pos: i + 1 }
  }
  return { ok: true }
}

/** piece 를 before 앞으로 옮긴다(before 가 null 이면 맨 뒤). 목록에 없던 조각은 새로 넣는다 */
export function movePiece(placed: number[], piece: number, before: number | null): number[] {
  if (before === piece) return placed
  const r = placed.filter(x => x !== piece), at = before === null ? -1 : r.indexOf(before)
  r.splice(at < 0 ? r.length : at, 0, piece)
  return r
}
