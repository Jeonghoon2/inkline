import type { Site } from '../../shared/types.ts'

export interface ParsedProblemUrl { site: Site; siteId: string; url: string }

const PROGRAMMERS_HOSTS = ['school.programmers.co.kr', 'programmers.co.kr']
const LEETCODE_HOSTS = ['leetcode.com', 'www.leetcode.com']

// 문제 주소를 사이트 · 문제 id · 정규화한 주소로 바꾼다. 알아볼 수 없으면 null
export function parseProblemUrl(input: string): ParsedProblemUrl | null {
  let u: URL
  try {
    u = new URL(input.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null

  const pm = u.pathname.match(/^\/learn\/courses\/30\/lessons\/(\d+)\/?$/)
  if (PROGRAMMERS_HOSTS.includes(u.hostname) && pm) {
    const siteId = pm[1]
    return { site: 'programmers', siteId, url: `https://school.programmers.co.kr/learn/courses/30/lessons/${siteId}` }
  }

  const lm = u.pathname.match(/^\/problems\/([a-z0-9-]+)(?:\/.*)?$/)
  if (LEETCODE_HOSTS.includes(u.hostname) && lm) {
    const siteId = lm[1]
    return { site: 'leetcode', siteId, url: `https://leetcode.com/problems/${siteId}/` }
  }
  return null
}
