import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { PanelLeft } from 'lucide-react'
import { Rail, type TabId } from './shell/Rail.tsx'
import { Sidebar } from './shell/Sidebar.tsx'
import { Home } from './home/Home.tsx'
import { SettingsTab } from './tabs/Settings.tsx'
import { ReportsTab } from './tabs/Reports.tsx'
import { ResumeTab } from './tabs/Resume.tsx'
import { HistoryTab } from './tabs/History.tsx'
import { KnowledgeTab } from './tabs/Knowledge.tsx'
import { DrillTab } from './tabs/Drill.tsx'
import { CodingTab } from './tabs/Coding.tsx'
import { CertTab } from './cert/CertTab.tsx'
import { useHistory } from './history/useHistory.ts'
import type { Settings } from '../shared/types.ts'
import { isDarkTheme, resolveTheme } from '../shared/themes.ts'
import { t } from '../shared/i18n.ts'

// 고른 테마를 <html data-theme · data-scheme> 에. '시스템 설정'이면 맥이 밝음 ↔ 어두움으로 바뀔 때 다시 칠한다
export type ThemeCfg = Pick<Settings, 'theme' | 'theme.light' | 'theme.dark'>
let themeCfg: ThemeCfg | null = null
const systemDark = window.matchMedia('(prefers-color-scheme: dark)')
const paintTheme = (): void => {
  if (!themeCfg) return
  const t = resolveTheme(themeCfg.theme, themeCfg['theme.light'], themeCfg['theme.dark'], systemDark.matches)
  document.documentElement.dataset.theme = t
  document.documentElement.dataset.scheme = isDarkTheme(t) ? 'dark' : 'light'
  const css = getComputedStyle(document.documentElement)
  void window.api.app.titleBar(css.getPropertyValue('--rail').trim(), css.getPropertyValue('--fg').trim()).catch(() => {})
}
systemDark.addEventListener('change', paintTheme)
export function applyTheme(c: ThemeCfg): void {
  themeCfg = c
  paintTheme()
}

// 언어는 앱 시작 후 정해지므로 표는 한국어로 두고 그릴 때 t() 로 바꾼다
const TITLES: Record<TabId, string> = {
  home: 'Inkline',
  history: '작업 기록', // i18n-ok
  reports: '주간 보고', // i18n-ok
  resume: '이력서', // i18n-ok
  knowledge: '지식사전', // i18n-ok
  coding: '코테 연습', // i18n-ok
  cert: '자격증', // i18n-ok
  drill: '면접 연습', // i18n-ok
  settings: '환경설정' // i18n-ok
}

export function App() {
  const [tab, setTab] = useState<TabId>('home')
  const [sideOpen, setSideOpen] = useState(true)
  const [focus, setFocus] = useState(false) // 풀이 화면이면 보조 사이드바를 감춘다
  const onFocus = useCallback((on: boolean) => setFocus(on), [])
  const [side, setSide] = useState<HTMLDivElement | null>(null)
  const history = useHistory()
  const [req, setReq] = useState<{ id: number; mode: 'learn' | 'review'; n: number } | null>(null)
  // 코테 탭을 떠나면 요청을 비워, 다시 돌아왔을 때 같은 문제가 또 열리지 않게 한다
  const [kreq, setKreq] = useState<{ key: string; n: number } | null>(null)
  const [cpreset, setCpreset] = useState<{ kind: 'due' | 'solving'; n: number } | null>(null)
  const [railN, setRailN] = useState(0) // 지금 탭의 레일 단추를 다시 누른 횟수
  useEffect(() => (tab === 'knowledge' ? () => setKreq(null) : undefined), [tab])
  useEffect(() => (tab === 'coding' ? () => { setReq(null); setCpreset(null) } : undefined), [tab])

  useEffect(() => {
    window.api.settings.all().then(applyTheme).catch(e => console.error('설정을 읽지 못했습니다', e))
  }, [])

  // 다음 계획들에서 탭마다 실제 화면으로 바꾼다
  const body: Record<TabId, ReactNode> = {
    home: <Home side={side} entries={history.data?.entries ?? []} onTab={setTab} onCodingFilter={kind => { setCpreset({ kind, n: Date.now() }); setTab('coding') }} onOpen={(id, mode) => { setReq({ id, mode, n: Date.now() }); setTab('coding') }} onCoding={() => setTab('coding')} />,
    history: <HistoryTab side={side} history={history} onSettings={() => setTab('settings')} onKnowledge={key => { setKreq({ key, n: Date.now() }); setTab('knowledge') }} />,
    reports: <ReportsTab side={side} history={history} onSettings={() => setTab('settings')} />,
    resume: <ResumeTab side={side} history={history} onSettings={() => setTab('settings')} />,
    knowledge: <KnowledgeTab side={side} onSettings={() => setTab('settings')} request={kreq} />,
    coding: <CodingTab side={side} onSettings={() => setTab('settings')} onFocus={onFocus} onHome={() => setTab('home')} request={req} preset={cpreset} reset={railN} />,
    cert: <CertTab side={side} />,
    drill: <DrillTab side={side} history={history} onSettings={() => setTab('settings')} />,
    settings: <SettingsTab onTheme={applyTheme} />
  }

  return (
    <div className="app">
      <Rail active={tab} onSelect={t => { if (t === tab) setRailN(n => n + 1); setTab(t) }} />
      <aside className={sideOpen && !(focus && tab === 'coding') ? 'side' : 'side collapsed'}>
        <Sidebar title={t(TITLES[tab])} bodyRef={setSide} />
      </aside>
      <main className="main">
        <div className="main-top drag">
          <button className="icon-btn" aria-label={sideOpen ? t('사이드바 접기') : t('사이드바 펴기')} aria-expanded={sideOpen} aria-disabled={focus && tab === 'coding'} disabled={focus && tab === 'coding'} onClick={() => setSideOpen(o => !o)}>
            <PanelLeft size={18} aria-hidden />
          </button>
        </div>
        {body[tab]}
      </main>
    </div>
  )
}
