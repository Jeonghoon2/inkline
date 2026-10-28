// 형광펜 ==글자|개념== 을 글자만 남기고 공백을 하나로 — 기록 글을 비교 · 짧게 자를 때 쓴다(main 의 보고 · 이력서 검사)
export const plain = (t: string): string => t.replace(/==([^=|]+)(\|[^=]+)?==/g, '$1').replace(/\s+/g, ' ').trim()
