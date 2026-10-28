// 쪽 글 조각 → 읽는 순서. pdf.js 는 그린 순서로 조각을 주어 2단 교재는 좌우 단이 줄마다 섞인다.
// 쪽 가운데에서 조각이 거의 지나지 않는 x(단 사이 여백)를 찾아 왼쪽 단 → 오른쪽 단으로 잇고, 여백을 가로지르는 줄(제목 · 머리말 · 쪽 번호)은 그 높이에 둔다
export interface Piece { str: string; x: number; y: number; w: number }
const BIN = 4
const row = (p: Piece): number => Math.round(p.y / 3) // 같은 줄로 볼 높이 차(3pt)

export function gutterOf(ps: Piece[], pageW: number): number | null {
  if (ps.length < 8) return null
  const cross = (x: number): number => ps.filter(p => p.x < x && p.x + p.w > x).length
  let first = -1, last = -1, bestN = Infinity
  for (let x = Math.floor(pageW * 0.3); x <= pageW * 0.7; x += BIN) {
    const n = cross(x)
    if (n < bestN) { bestN = n; first = x }
    if (n === bestN) last = x
  }
  const tol = Math.max(2, ps.length * 0.05)
  let best = (first + last) / 2 // 가장 덜 지나는 x 들의 가운데 — 가운데 놓인 좁은 조각(쪽 번호)도 여백을 가로지르게
  if (cross(best) > tol) best = first // 여백이 둘(3단 · 그림 구멍)이면 가운데가 글 위에 놓인다 — 첫 여백으로
  const left = ps.filter(p => p.x + p.w <= best).length, right = ps.filter(p => p.x >= best).length
  return cross(best) <= tol && left >= ps.length * 0.2 && right >= ps.length * 0.2 ? best : null
}

function lines(ps: Piece[]): string {
  const s = [...ps].sort((a, b) => row(b) - row(a) || a.x - b.x)
  let out = '', prev: Piece | null = null
  for (const p of s) {
    if (prev && row(p) !== row(prev)) out += '\n'
    else if (prev && p.x - (prev.x + prev.w) > 1.5) out += ' '
    out += p.str
    prev = p
  }
  return out
}
const tidy = (s: string): string => s.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n')

export function orderPage(ps: Piece[], pageW: number): string {
  const g = gutterOf(ps, pageW)
  if (g === null) return tidy(lines(ps))
  const wide = (p: Piece): boolean => p.x < g && p.x + p.w > g
  const wideRows = [...new Set(ps.filter(wide).map(row))].sort((a, b) => b - a)
  const parts: string[] = []
  let top = Infinity
  for (const wr of [...wideRows, -Infinity]) {
    const band = ps.filter(p => !wide(p) && row(p) < top && row(p) > wr)
    const L = band.filter(p => p.x + p.w <= g), R = band.filter(p => p.x >= g)
    if (L.length) parts.push(lines(L))
    if (R.length) parts.push(lines(R))
    if (wr !== -Infinity) parts.push(lines(ps.filter(p => row(p) === wr)))
    top = wr
  }
  return tidy(parts.join('\n'))
}
