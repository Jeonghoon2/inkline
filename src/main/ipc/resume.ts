import { app, dialog, ipcMain, net, BrowserWindow } from 'electron'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { RESUME_SCHEMA, RESUME_SYSTEM, careerOf, cvHead, writeCvHead, writeRoleSkeleton, loadGuide, listBackups, restoreBackup, cvKey, cvSlug, resumeFile, saveResume, sinceDate } from '../resumeUpdate.ts'
import { runReview, runUpdate } from '../resumePipeline.ts'
import type { Ask } from '../ai/run.ts'
import { RESEARCH_SYSTEM, ROLE_LABELS, gatherRole, materialOf } from '../roleResearch.ts'
import { validate } from '../ai/schema.ts'
import { pdfPages } from '../pdf.ts'
import { getSettings, setSetting } from '../db.ts'
import { loadHistory } from '../history.ts'
import { type ResumeChange, type ResumeStage, type ResumeUpdateResult } from '../../shared/types.ts'
import type { Ctx } from './ctx.ts'
import { t } from '../../shared/i18n.ts'

export function registerResume(ctx: Ctx): () => void {
  const { db, defaults, aiAsk, skillDir } = ctx
  // 이력서 PDF — 지금 보이는 화면을 인쇄 CSS(@media print)로 A4 에 찍는다
  ipcMain.handle('resume:savePdf', async (e, defaultName: unknown) => {
    if (typeof defaultName !== 'string' || !defaultName || /[\\/]/.test(defaultName)) throw new Error(t('잘못된 파일 이름')) // Windows 는 \ 도 경로 구분자
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts = { defaultPath: join(app.getPath('desktop'), `${defaultName}.pdf`), filters: [{ name: 'PDF', extensions: ['pdf'] }] }
    const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (r.canceled || !r.filePath) return null
    // 쪽 크기 · 여백은 인쇄 CSS 의 @page(A4, 16mm 14mm)가 정한다 — PrintToPDFOptions 타입에 marginType 이 없다
    const pdf = await e.sender.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true })
    await writeFile(r.filePath, pdf)
    return { path: r.filePath, pages: (await pdfPages(new Uint8Array(pdf))).length }
  })
  // 이력서 최신화 — 마지막 최신화 이후 기록으로 AI 가 고칠 곳을 내고, 체크한 것만 저장한다
  const cvSince = async (slug: string): Promise<{ file: string; since: string } | null> => {
    const s = getSettings(db, defaults), file = resumeFile(s.historyRoot, slug)
    const st = await stat(file).catch(() => null)
    return st ? { file, since: sinceDate(s['resume.through'][cvKey(slug)], st.mtime) } : null
  }
  ipcMain.handle('resume:since', async (_e, v: unknown) => (await cvSince(cvSlug(v)))?.since ?? null)
  let resumeAc: AbortController | null = null
  // 최신화(update) · 점검(review) — 같은 이력서 · 기록 · 가이드를 읽고 모듈(resumePipeline)을 돌려 비교 카드를 낸다. 점검은 새 성과를 더하지 않고 through 도 바꾸지 않는다
  // 직무 자료 모으기 — AI(웹 검색) → 출처 주소를 앱이 직접 열어 보고 → Knowledge/resume/<직무>/ 에 쓴다
  const probe = async (url: string): Promise<boolean> => { const r = await net.fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null); void r?.body?.cancel(); return !!r && r.status < 400 }
  const gather = (slug: string, signal: AbortSignal) => gatherRole({ dir: join(skillDir, 'Knowledge', 'resume', slug), slug, label: ROLE_LABELS[slug] ?? '', now: new Date(), probe,
    ask: (prompt, schema) => aiAsk({ task: 'resume-research', system: RESEARCH_SYSTEM, prompt, schema, timeoutMs: 480_000, deadlineMs: 480_000, signal, web: true }) })
  const resumeAsk = async (v: unknown, mode: 'update' | 'review', stage: (s: ResumeStage) => void): Promise<ResumeUpdateResult> => {
    const slug = cvSlug(v)
    // 취소 장치는 맨 처음에 — 읽는 동안 취소해도 먹고, 늦게 끝난 앞 실행이 새 실행을 취소하지 않는다
    resumeAc?.abort()
    const ac = (resumeAc = new AbortController())
    const aborted = { ok: false as const, error: { code: 'aborted' as const, message: t('취소했습니다') } }
    try {
      stage({ stage: 'read', state: 'on' })
      const at = await cvSince(slug)
      if (!at) return { ok: false, error: { code: 'not-found', message: t('이력서 파일이 없습니다') } }
      const entries = loadHistory(getSettings(db, defaults).historyRoot).entries // 전체 기록 — 새 기록(since 부터)만 자세히 넣는다
      if (!entries.length) return { ok: false, error: { code: 'not-found', message: t('작업 기록이 없습니다') } }
      const count = entries.filter(e => e.date >= at.since).length
      stage({ stage: 'records', state: 'done', note: mode === 'review' ? t('전체 {n}건(사실 확인)', { n: entries.length }) : t('전체 {n}건 · 새 {m}건', { n: entries.length, m: count }) })
      const resume = await readFile(at.file, 'utf8')
      const kdir = join(skillDir, 'Knowledge', 'resume')
      const hasGuide = !!(await stat(join(skillDir, 'RESUME-GUIDE.md')).catch(() => null))
      stage({ stage: 'read', state: 'done', note: hasGuide ? t('작성 가이드 · 채용 근거') : t('가이드 없음') })
      // 직무 자료 — 없는 직무는 처음 한 번 웹에서 모은다(최신화만, 점검은 있는 자료로)
      if (slug && mode === 'update') {
        stage({ stage: 'research', state: 'on' })
        const have = await materialOf(join(kdir, slug))
        if (have) stage({ stage: 'research', state: 'done', note: `${t('자료 있음 · {date}', { date: `${have.at.getMonth() + 1}.${have.at.getDate()}` })}${have.sources ? ` · ${t('출처 {n}개', { n: have.sources })}` : ''}` })
        else {
          const g = await gather(slug, ac.signal)
          if (ac.signal.aborted) return aborted
          stage({ stage: 'research', state: 'done', note: g.ok ? t('출처 {n}개 · 열어 봄 {m}', { n: g.sources, m: g.opened }) : t('모으지 못함 — 공통 자료로') })
        }
      }
      const { guide, roleDocs } = await loadGuide(skillDir, slug) // 직무 자료를 모은 뒤에 읽는다
      if (ac.signal.aborted) return aborted
      const career = slug && !careerOf(resume) ? careerOf(await readFile(resumeFile(getSettings(db, defaults).historyRoot, ''), 'utf8').catch(() => '')) : ''
      const ctx = { resume, guide, role: slug, roleDocs, entries, since: at.since, personal: getSettings(db, defaults)['history.personal'], career, polish: true }
      const ask: Ask = (task, prompt, schema) => aiAsk({ task, system: RESUME_SYSTEM, prompt, schema, timeoutMs: 240_000, deadlineMs: 240_000, signal: ac.signal })
      const r = await (mode === 'review' ? runReview : runUpdate)(ctx, ask, stage)
      if (!r.ok) return r
      return { ok: true, changes: r.changes, skipped: r.skipped, through: entries.map(e => e.date).sort().at(-1)!, count, total: entries.length, noGuide: !guide, risky: r.risky }
    } finally {
      if (resumeAc === ac) resumeAc = null
    }
  }
  // 지금 단계를 화면에 알린다 — 진행 그림이 실제 단계를 따라간다
  const stageTo = (e: Electron.IpcMainInvokeEvent) => (s: ResumeStage): void => { if (!e.sender.isDestroyed()) e.sender.send('resume:stage', s) }
  ipcMain.handle('resume:update', (e, v: unknown) => resumeAsk(v, 'update', stageTo(e)))
  ipcMain.handle('resume:review', (e, v: unknown) => resumeAsk(v, 'review', stageTo(e)))
  ipcMain.handle('resume:cancel', () => { resumeAc?.abort() })
  // [자료 다시 모으기] — 있는 자료를 새로 모은 것으로 바꾼다(직무 이력서만)
  ipcMain.handle('resume:research', async (_e, v: unknown) => {
    const slug = cvSlug(v)
    if (!slug) throw new Error(t('직무 이력서에서만 모읍니다'))
    resumeAc?.abort()
    const ac = (resumeAc = new AbortController())
    try { return await gather(slug, ac.signal) } finally { if (resumeAc === ac) resumeAc = null }
  })
  ipcMain.handle('resume:save', async (_e, v: unknown, changes: unknown, through: unknown) => {
    const slug = cvSlug(v)
    if (typeof through !== 'string' || !(through === '' || /^\d{4}-\d{2}-\d{2}$/.test(through))) throw new Error(t('잘못된 날짜')) // '' = 점검 저장, 최신화 날짜는 그대로
    if (validate({ changes, skipped: [] }, RESUME_SCHEMA)) throw new Error(t('잘못된 변경'))
    const s = getSettings(db, defaults)
    const r = await saveResume({ file: resumeFile(s.historyRoot, slug), backupDir: join(app.getPath('userData'), 'resume-backups'), changes: changes as ResumeChange[], now: new Date() })
    // 고른 것을 하나도 못 넣었으면 본 것으로 치지 않는다(빈 저장 = '이 기록까지 본 것으로 하기'는 친다)
    if (through && (r.applied || !(changes as unknown[]).length)) setSetting(db, 'resume.through', { ...s['resume.through'], [cvKey(slug)]: through })
    // 이 백업으로 되돌릴 때 through 도 함께 되돌리려고 이전 값을 적어 둔다(최근 50개만)
    if (r.backup) setSetting(db, 'resume.backupThrough', Object.fromEntries(Object.entries({ ...s['resume.backupThrough'], [r.backup]: s['resume.through'][cvKey(slug)] ?? '' }).slice(-50)))
    return r
  })
  const backupDir = (): string => join(app.getPath('userData'), 'resume-backups')
  ipcMain.handle('resume:backups', (_e, v: unknown) => listBackups(backupDir(), resumeFile(getSettings(db, defaults).historyRoot, cvSlug(v))))
  // 온보딩 — 기본 이력서 머리. 화면에서 온 값은 여기서 다시 검사한다
  ipcMain.handle('resume:head', async () => cvHead(await readFile(resumeFile(getSettings(db, defaults).historyRoot, ''), 'utf8').catch(() => '')))
  ipcMain.handle('resume:setHead', async (_e, v: unknown) => {
    const h = v as Record<string, unknown>
    const ok = (k: string, re: RegExp, max: number): string => { const x = h?.[k]; if (typeof x !== 'string' || x.length > max || /[\r\n]/.test(x) || !re.test(x.trim())) throw new Error(t('잘못된 {what}', { what: k })); return x.trim() }
    const head = {
      name: ok('name', /^[^#\[\]]+$/, 40),
      email: ok('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/, 100),
      phone: ok('phone', /^[0-9+\-() .]*$/, 20),
      github: ok('github', /^(https?:\/\/\S+)?$/, 200),
      portfolio: ok('portfolio', /^(https?:\/\/\S+)?$/, 200),
      company: ok('company', /^[^#\[\]·]*$/, 40), // '·' 는 '회사 · 직책' 을 가르는 표시
      title: ok('title', /^[^#\[\]]*$/, 30),
      start: ok('start', /^(\d{4}\.(0[1-9]|1[0-2]))?$/, 7),
      end: ok('end', /^(\d{4}\.(0[1-9]|1[0-2]))?$/, 7)
    }
    if (head.company && (!head.start || (head.end && head.end < head.start))) throw new Error(t('잘못된 재직 기간'))
    await writeCvHead({ file: resumeFile(getSettings(db, defaults).historyRoot, ''), backupDir: backupDir(), head, now: new Date() })
  })
  ipcMain.handle('resume:addRole', async (_e, v: unknown) => writeRoleSkeleton(getSettings(db, defaults).historyRoot, cvSlug(v)))
  ipcMain.handle('resume:restore', async (_e, v: unknown, name: unknown) => {
    if (typeof name !== 'string') throw new Error(t('잘못된 백업 이름'))
    const slug = cvSlug(v), s = getSettings(db, defaults)
    await restoreBackup({ file: resumeFile(s.historyRoot, slug), backupDir: backupDir(), name, now: new Date() })
    const prev = s['resume.backupThrough'][name], through = { ...s['resume.through'] }
    if (prev) through[cvKey(slug)] = prev; else delete through[cvKey(slug)]
    setSetting(db, 'resume.through', through)
  })
  return () => { resumeAc?.abort() }
}
