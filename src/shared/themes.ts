// 화면 테마 — 색은 renderer/styles/tokens.css 의 :root[data-theme='<id>'] 묶음. dark 는 코드 편집기 바탕 고르기에 쓴다
export const THEMES = [
  { id: 'light', label: '밝게', dark: false },
  { id: 'paper', label: '종이', dark: false },
  { id: 'solarized-light', label: 'Solarized Light', dark: false },
  { id: 'sky', label: '하늘', dark: false },
  { id: 'dark', label: '어둡게', dark: true },
  { id: 'ink', label: '먹', dark: true },
  { id: 'nord', label: 'Nord', dark: true },
  { id: 'dracula', label: 'Dracula', dark: true },
  { id: 'solarized-dark', label: 'Solarized Dark', dark: true }
] as const
export type ThemeName = (typeof THEMES)[number]['id']
export type Theme = 'system' | ThemeName

export const isThemeName = (v: unknown): v is ThemeName => THEMES.some(t => t.id === v)
export const isDarkTheme = (t: ThemeName): boolean => THEMES.some(x => x.id === t && x.dark)
// '시스템 설정'이면 맥이 밝을 때 · 어두울 때 고른 테마
export const resolveTheme = (theme: Theme, light: ThemeName, dark: ThemeName, systemDark: boolean): ThemeName =>
  theme === 'system' ? (systemDark ? dark : light) : theme
