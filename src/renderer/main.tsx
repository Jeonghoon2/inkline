import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/shell.css'
import './styles/settings.css'
import './styles/history.css'
import './styles/resume.css'
import './styles/coding.css'
import './styles/practice.css'
import './styles/after.css'
import './styles/theory.css'
import './styles/knowledge.css'
import './styles/drill.css'
import './styles/cert.css'
import { App } from './App.tsx'
import { resolveLang, setLang } from '../shared/i18n.ts'

// 언어는 첫 화면부터 맞아야 해서 설정을 읽은 뒤 그린다. 바꾸면 환경설정이 창을 다시 연다
void window.api.settings.all().then(s => setLang(resolveLang(s['ui.lang'], navigator.language)), () => {}).finally(() => createRoot(document.getElementById('root')!).render(<App />))
