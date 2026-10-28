import { BrowserWindow, session } from 'electron'
import { LANGS, type Lang, type ProblemDraft, type Site } from '../../shared/types.ts'
import { LEET_QUERY, parseLeetCode, type LeetQuestion } from './leetcode.ts'
import { parseProgrammers } from './programmers.ts'
import { t } from '../../shared/i18n.ts'

const TIMEOUT = 15_000
const IMAGES_TOTAL = 20_000
const MAX_PAGE = 3 * 1024 * 1024
const MAX_IMAGE = 2 * 1024 * 1024
const LOGIN_URL: Record<Site, string> = {
  programmers: 'https://programmers.co.kr/account/sign_in',
  leetcode: 'https://leetcode.com/accounts/login/'
}

let permissionsDenied = false
function sitesSession(): Electron.Session {
  const ses = session.fromPartition('persist:sites')
  if (!permissionsDenied) {
    permissionsDenied = true
    ses.setPermissionRequestHandler((_, __, cb) => cb(false))
  }
  return ses
}

// 본문을 받되 limit 바이트를 넘으면 버린다 (헤더가 거짓이어도 실제 크기로 다시 잰다)
async function readBody(res: Response, limit: number, tooBig: string): Promise<Buffer> {
  if (Number(res.headers.get('content-length') ?? 0) > limit) throw new Error(tooBig)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > limit) throw new Error(tooBig)
  return buf
}
const PAGE_TOO_BIG = '문제 페이지가 너무 큽니다'

export async function fetchDraft(site: Site, siteId: string): Promise<ProblemDraft | 'need-login' | 'not-found' | 'parse-failed'> {
  try {
    return await fetchDraftRaw(site, siteId)
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new Error(t('시간 초과'))
    throw e
  }
}

async function fetchDraftRaw(site: Site, siteId: string): Promise<ProblemDraft | 'need-login' | 'not-found' | 'parse-failed'> {
  const ses = sitesSession()
  if (site === 'programmers') {
    const pages: Partial<Record<Lang, string>> = {}
    for (const lang of LANGS) {
      const res = await ses.fetch(`https://school.programmers.co.kr/learn/courses/30/lessons/${siteId}?language=${lang}`, { signal: AbortSignal.timeout(TIMEOUT) })
      if (res.status === 404) return 'not-found'
      if (/\/account\/|sign_in/.test(new URL(res.url || 'https://x/').pathname)) return 'need-login'
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      pages[lang] = (await readBody(res, MAX_PAGE, t(PAGE_TOO_BIG))).toString('utf8')
    }
    const d = parseProgrammers(siteId, pages)
    if (!d) console.error('programmers.ts: 본문을 찾지 못함', siteId)
    return d ?? 'parse-failed'
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Referer: `https://leetcode.com/problems/${siteId}/` }
  const [csrf] = await ses.cookies.get({ url: 'https://leetcode.com', name: 'csrftoken' })
  if (csrf) headers['x-csrftoken'] = csrf.value
  const res = await ses.fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: LEET_QUERY, variables: { s: siteId } }),
    signal: AbortSignal.timeout(TIMEOUT)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = JSON.parse((await readBody(res, MAX_PAGE, t(PAGE_TOO_BIG))).toString('utf8')) as { data?: { question?: LeetQuestion | null }; errors?: { message?: string }[] }
  if (!json.data) throw new Error(json.errors?.[0]?.message ?? t('GraphQL 응답 오류'))
  const q = json.data.question
  if (!q) return 'not-found'
  return parseLeetCode(q) ?? 'need-login'
}

async function toDataUri(ses: Electron.Session, src: string, signal: AbortSignal): Promise<string | null> {
  try {
    const res = await ses.fetch(src, { signal })
    if (!res.ok) return null
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
    if (!type.startsWith('image/')) return null
    const buf = await readBody(res, MAX_IMAGE, 'big')
    return `data:${type};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

// CSP 가 바깥 이미지를 막으므로 data URI 로 바꾼다. 못 받으면 src 를 지우고 alt 만 남긴다
export async function inlineImages(html: string): Promise<string> {
  const ses = sitesSession()
  const tags = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0])
  const srcOf = (tag: string): string | undefined => /\ssrc\s*=\s*"(https:\/\/[^"]*)"/i.exec(tag)?.[1]
  const signal = AbortSignal.timeout(IMAGES_TOTAL) // 이미지 전체에 한 번의 마감
  const uris = new Map<string, string | null>()
  for (const src of new Set(tags.map(srcOf))) if (src) uris.set(src, await toDataUri(ses, src.replace(/&amp;/g, '&'), signal))
  return html.replace(/<img\b[^>]*>/gi, tag => {
    const src = srcOf(tag)
    if (!src) return tag
    const uri = uris.get(src)
    return tag.replace(/\ssrc\s*=\s*"[^"]*"/i, uri ? ` src="${uri}"` : '')
  })
}

const loginWindows = new Set<BrowserWindow>()

export function openLogin(site: Site): Promise<void> {
  sitesSession()
  const win = new BrowserWindow({
    width: 980,
    height: 760,
    webPreferences: { partition: 'persist:sites', sandbox: true, contextIsolation: true }
  })
  loginWindows.add(win)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void win.loadURL(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!/^https?:/i.test(url)) e.preventDefault()
  })
  void win.loadURL(LOGIN_URL[site]).catch(() => {})
  return new Promise(resolve =>
    win.on('closed', () => {
      loginWindows.delete(win)
      resolve()
    })
  )
}

export function closeLoginWindows(): void {
  for (const w of [...loginWindows]) if (!w.isDestroyed()) w.close()
}
