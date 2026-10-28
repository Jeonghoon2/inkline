// ISO 주(월요일 시작) — 주간 보고 파일 이름 YYYY-Www 와 같은 규칙
export interface Week { key: string; start: string; end: string } // start · end 는 월 · 일요일 'YYYY-MM-DD'

const DAY = 86_400_000
const ymd = (t: number): string => new Date(t).toISOString().slice(0, 10)

export function weekOf(date: string): Week {
  const [y, m, d] = date.split('-').map(Number)
  const t = Date.UTC(y!, m! - 1, d!)
  const dow = (new Date(t).getUTCDay() + 6) % 7 // 월 0 … 일 6
  const mon = t - dow * DAY
  const thu = mon + 3 * DAY
  const year = new Date(thu).getUTCFullYear()
  const jan4 = Date.UTC(year, 0, 4)
  const w1mon = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY
  const week = 1 + Math.round((mon - w1mon) / (7 * DAY))
  return { key: `${year}-W${String(week).padStart(2, '0')}`, start: ymd(mon), end: ymd(mon + 6 * DAY) }
}

// 이번 주부터 거꾸로 n 주 (지역 날짜 기준)
export function recentWeeks(now: Date, n: number): Week[] {
  const out: Week[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7 * i)
    out.push(weekOf(localDay(d)))
  }
  return out
}

// 지역 시간 기준 'YYYY-MM-DD' — toISOString 은 UTC 라 밤에 하루가 어긋난다
export const localDay = (d: Date): string => d.toLocaleDateString('sv-SE')
export const md = (date: string): string => `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}` // '2026-10-06' → '10.6'
