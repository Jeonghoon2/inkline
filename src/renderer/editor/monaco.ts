import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker'
import type { Lang } from '../../shared/types.ts'

self.MonacoEnvironment = {
  getWorker(_id, label) {
    return label === 'typescript' || label === 'javascript' ? new TsWorker() : new EditorWorker()
  }
}

export const MONACO_LANG: Record<Lang, string> = { python3: 'python', java: 'java', javascript: 'javascript', cpp: 'cpp' }

// 바탕은 앱 토큰 --main. 테마를 바꿀 때마다 다시 읽는다
export function applyMonacoTheme(dark: boolean): void {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--main').trim() || (dark ? '#212121' : '#ffffff')
  monaco.editor.defineTheme('inkline-light', { base: 'vs', inherit: true, rules: [], colors: { 'editor.background': bg } })
  monaco.editor.defineTheme('inkline-dark', { base: 'vs-dark', inherit: true, rules: [], colors: { 'editor.background': bg } })
  monaco.editor.setTheme(dark ? 'inkline-dark' : 'inkline-light')
}

export { monaco }
