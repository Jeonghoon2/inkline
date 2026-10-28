import { app, BrowserWindow, dialog, shell } from 'electron'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { readdir, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { loginPath, WIN } from './env.ts'
import { openDb, getSettings, setSetting } from './db.ts'
import { resolveLang, setLang, t } from '../shared/i18n.ts'
import { registerMediaScheme, handleMedia } from './media.ts'
import { isExternalHttpUrl } from './urls.ts'
import { killAll } from './proc.ts'
import { registerIpc } from './ipc/index.ts'
import { installSkills, ensureHistory } from './skills.ts'
import { initialBounds, rememberBounds } from './windowBounds.ts'
import { closeLoginWindows } from './coding/fetch.ts'
import { closePaperWindows } from './paperWindow.ts'
import { DEFAULT_SETTINGS, type Settings } from '../shared/types.ts'

registerMediaScheme() // app ready 전에

// 단일 인스턴스 — 두 번째로 켠 앱은 바로 끝내고 아무것도 열지 않는다
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

// 자식 프로세스(AI CLI · 실행기)가 셸과 같은 PATH 를 쓰게 맨 먼저
process.env.PATH = loginPath()
// 한국어 Windows 의 Python 은 표준 출력을 cp949 로 써서 한글 결과가 깨지거나 UnicodeEncodeError 가 난다
if (WIN) process.env.PYTHONUTF8 = '1'

function createWindow(): BrowserWindow {
  const b = initialBounds()
  const win = new BrowserWindow({
    ...b,
    minWidth: 960,
    minHeight: 600,
    show: false, // 첫 화면이 그려진 뒤 보인다 (빈 창이 번쩍이지 않게)
    // 맥은 신호등 단추를 위 36px 띠(.app::before) 가운데에, Windows 는 같은 띠 오른쪽에 창 단추를 얹는다(색은 테마가 정한다)
    ...(WIN
      ? { titleBarStyle: 'hidden' as const, titleBarOverlay: { color: '#f3f3f3', symbolColor: '#1f1f1f', height: 36 } }
      : { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 18, y: 12 } }),
    backgroundColor: '#f3f3f3',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })
  rememberBounds(win)
  win.once('ready-to-show', () => { if (b.maximized) win.maximize(); win.show() })
  win.on('closed', () => { closeLoginWindows(); closePaperWindows() }) // 로그인 창이 남으면 window-all-closed 가 오지 않는다
  // 바깥 링크는 앱 안에서 열지 않고 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttpUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // 앱 페이지를 벗어나는 이동은 막고, http(s) 면 기본 브라우저로
  win.webContents.on('will-navigate', (e, url) => {
    if (url === win.webContents.getURL()) return
    e.preventDefault()
    if (isExternalHttpUrl(url)) void shell.openExternal(url)
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

// 지난번에 앱이 갑자기 꺼져 남은 실행 · AI 임시 폴더를 지운다 (1시간 넘은 것만, 실패는 무시)
async function sweepTemp(): Promise<void> {
  const root = tmpdir(), old = Date.now() - 3_600_000
  for (const name of await readdir(root).catch(() => [] as string[])) {
    if (!name.startsWith('inkline-run-') && !name.startsWith('inkline-ai-') && !name.startsWith('inkline-knowledge-')) continue
    const p = join(root, name)
    try { if ((await stat(p)).mtimeMs < old) await rm(p, { recursive: true, force: true }) } catch { /* 지우지 못해도 그만 */ }
  }
}

// 앱에 넣어 간 스킬(설치 파일의 resources/skills)은 남의 ~/.claude 와 전역 지침을 바꾸는 일이라 처음 켤 때 묻고, 고른 대로만 깐다.
// 고른 뒤에는 묻지 않는다 — 깔기로 했으면 켤 때마다 새 앱의 스킬로 바꾼다(installSkills 가 표 있는 것만 바꾼다)
function setupSkills(db: DatabaseSync, defaults: Settings): void {
  const bundle = join(process.resourcesPath, 'skills')
  if (!app.isPackaged || !existsSync(bundle)) return
  let pick = getSettings(db, defaults)['setup.install']
  if (pick === 'ask') {
    const r = dialog.showMessageBoxSync({
      type: 'question', title: 'Inkline', defaultId: 0, cancelId: 2, noLink: true,
      buttons: [t('스킬과 지침 설치'), t('스킬만 설치'), t('설치하지 않음')],
      message: t('작업 기록에 쓰는 Claude Code 스킬을 설치할까요?'),
      detail: [
        t('스킬: ~/.claude/skills 에 work-history · knowledge · concept-shorts 를 복사합니다(Codex · Gemini 가 있으면 같은 폴더를 가리키는 링크를 만듭니다).'),
        t('지침: ~/.claude/CLAUDE.md 에(있으면 ~/.codex/AGENTS.md · ~/.gemini/GEMINI.md 에도) 언제 작업 기록을 남길지 정하는 두 줄을 덧붙입니다. 이미 work-history 를 말하는 파일은 건드리지 않습니다.'),
        t('고르지 않으면 작업 기록 · 지식사전 화면이 빈 채로 열립니다.'),
      ].join('\n')
    })
    pick = (['yes', 'skills', 'no'] as const)[r] ?? 'no'
    setSetting(db, 'setup.install', pick)
  }
  if (pick !== 'no') installSkills(bundle, homedir(), pick === 'yes')
}

app.whenReady().then(() => {
  if (!gotLock) return
  void sweepTemp()
  try {
    let win: BrowserWindow | null = null
    const db = openDb(join(app.getPath('userData'), 'inkline.db'))
    const defaults: Settings = { ...DEFAULT_SETTINGS, historyRoot: join(homedir(), 'My-History') }
    setLang(resolveLang(getSettings(db, defaults)['ui.lang'], app.getLocale()))
    setupSkills(db, defaults)
    if (app.isPackaged) ensureHistory(getSettings(db, defaults).historyRoot)
    const stopIpc = registerIpc(db, defaults, channel => { if (win && !win.isDestroyed()) win.webContents.send(channel) })
    handleMedia(() => getSettings(db, defaults).historyRoot)
    win = createWindow()
    app.on('second-instance', () => {
      if (!win) return
      if (win.isMinimized()) win.restore()
      win.focus()
    })
    app.on('will-quit', () => { closePaperWindows(); stopIpc(); killAll(); db.close() })
  } catch (e) {
    dialog.showErrorBox(t('Inkline 을 시작하지 못했습니다'), String(e instanceof Error ? e.message : e))
    app.quit()
  }
})
app.on('window-all-closed', () => app.quit())
