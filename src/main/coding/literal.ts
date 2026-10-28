const NAMED = new Map([
  ['lt', '<'],
  ['gt', '>'],
  ['amp', '&'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' ']
])

// 한 번만 훑으므로 &amp;lt; 가 < 로 두 번 풀리지 않는다
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return cp <= 0x10ffff ? String.fromCodePoint(cp) : whole
    }
    return NAMED.get(e.toLowerCase()) ?? whole
  })
}

// 예제 칸의 글자를 값으로. JSON → 작은따옴표를 큰따옴표로 바꾼 JSON → 그대로 문자열
export function parseLiteral(text: string): unknown {
  const s = text.trim()
  try {
    return JSON.parse(s)
  } catch {
    // 아래에서 다시 본다
  }
  try {
    return JSON.parse(s.replace(/'/g, '"'))
  } catch {
    return s
  }
}
