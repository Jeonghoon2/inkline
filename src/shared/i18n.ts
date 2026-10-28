// 화면 언어 — 라이브러리 없이 한국어 원문을 키로 쓴다. 사전에 없으면 한국어가 그대로 나온다
// main 과 renderer 가 각자 이 모듈을 하나씩 갖고, 시작할 때 설정의 ui.lang 을 resolveLang 으로 풀어 setLang 한다
import history from './i18n/history.ts'
import practice from './i18n/practice.ts'
import cert from './i18n/cert.ts'
import shell from './i18n/shell.ts'
import main from './i18n/main.ts'

export type UiLang = 'ko' | 'en'
export type UiLangPref = 'system' | UiLang // 설정에 저장하는 값 — system 이면 운영체제 언어를 따른다
export const UI_LANG_PREFS: UiLangPref[] = ['system', 'ko', 'en']
// 운영체제 언어가 한국어면 한국어, 그 밖에는 영어(사전이 두 언어뿐이다)
export const resolveLang = (pref: UiLangPref, systemLocale: string): UiLang =>
  pref !== 'system' ? pref : systemLocale.toLowerCase().startsWith('ko') ? 'ko' : 'en'
export const EN: Record<string, string> = { ...history, ...practice, ...cert, ...shell, ...main }

let cur: UiLang = 'ko'
export const setLang = (l: UiLang): void => { cur = l }
export const getLang = (): UiLang => cur
// 날짜 · 숫자 표시용 locale
export const locale = (): string => (cur === 'en' ? 'en-US' : 'ko-KR')

export function t(ko: string, vars?: Record<string, string | number>): string {
  let s = cur === 'en' ? (EN[ko] ?? ko) : ko
  // 영어는 '{n} entries' 처럼 사전에 복수로 적고, 값이 1이면 바로 뒤 낱말을 단수로 바꾼다(entries → entry, pages → page)
  if (vars && cur === 'en') s = s.replace(/\{(\w+)\} ([a-z]+)s\b/g, (m, k: string, w: string) => (vars[k] === 1 ? `{${k}} ${w.endsWith('ie') ? w.slice(0, -2) + 'y' : w}` : m))
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s
}

// AI 에 붙이는 결과 언어 지시 — 프롬프트 본문은 한국어 그대로 두고 답의 언어만 바꾼다.
// 이력서처럼 이미 있는 문서에 들어갈 글은 그 문서의 언어를 따른다(한국어 이력서에 영어 줄이 섞이면 문서가 깨진다)
export const AI_LANG_RULE: Record<UiLang, string> = {
  ko: '',
  en: '\n\nOutput language: write every human-readable string value in your JSON answer in English. Keep JSON keys, enum values, numbers, code, file paths, and text quoted from the input exactly as given. Exception: text that will be inserted into an existing document (for example resume lines) stays in that document\'s language.'
}
