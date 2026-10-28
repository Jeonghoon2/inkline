type Headers = Record<string, string[] | string>
const find = (h: Headers, name: string): string[] => Object.entries(h).filter(([k]) => k.toLowerCase() === name).flatMap(([, v]) => v)

export const isPdfResponse = (h: Headers): boolean => find(h, 'content-type').some(v => /application\/pdf/i.test(v))

// 화면에 띄우지 않고 내려받게 한다 — 기존 Content-Disposition 은 대소문자 상관없이 바꾼다
export function forceAttachment(h: Headers): Headers {
  const out: Headers = {}
  for (const [k, v] of Object.entries(h)) if (k.toLowerCase() !== 'content-disposition') out[k] = v
  out['Content-Disposition'] = ['attachment']
  return out
}
