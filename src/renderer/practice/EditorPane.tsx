import { useEffect, useRef } from 'react'
import type { Lang } from '../../shared/types.ts'
import { useTheme } from '../editor/theme.ts'

type Mod = typeof import('../editor/monaco.ts')
export type EditorReady = [Ed, typeof import('monaco-editor')]
type Ed = import('monaco-editor').editor.IStandaloneCodeEditor
const TAB: Record<Lang, number> = { python3: 4, javascript: 2, java: 4, cpp: 4 }

export function EditorPane({ lang, value, onChange, onRun, onReady }: { lang: Lang; value: string; onChange: (v: string) => void; onRun: () => void; onReady?: (editor: Ed, monaco: typeof import('monaco-editor')) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const ed = useRef<Ed | null>(null)
  const mod = useRef<Mod | null>(null)
  const cb = useRef({ onChange, onRun, onReady, lang, value })
  cb.current = { onChange, onRun, onReady, lang, value }
  const { dark, name: themeName } = useTheme()
  const darkRef = useRef(dark)
  darkRef.current = dark

  const sync = (): void => {
    const e = ed.current, m = mod.current
    if (!e || !m) return
    const model = e.getModel()
    const { lang: l, value: v } = cb.current
    if (model) {
      if (model.getLanguageId() !== m.MONACO_LANG[l]) m.monaco.editor.setModelLanguage(model, m.MONACO_LANG[l])
      if (model.getValue() !== v) e.setValue(v)
    }
    e.updateOptions({ tabSize: TAB[l] })
  }

  useEffect(() => {
    let dead = false
    let made: Ed | null = null
    import('../editor/monaco.ts').then(m => {
      if (dead || !host.current) return
      mod.current = m
      m.applyMonacoTheme(darkRef.current)
      made = ed.current = m.monaco.editor.create(host.current, {
        value: cb.current.value,
        language: m.MONACO_LANG[cb.current.lang],
        fontFamily: "'SF Mono', ui-monospace, Menlo, monospace",
        fontSize: 13,
        minimap: { enabled: false },
        tabSize: TAB[cb.current.lang],
        automaticLayout: true,
        scrollBeyondLastLine: false
      })
      made.onDidChangeModelContent(() => cb.current.onChange(made!.getValue()))
      made.addCommand(m.monaco.KeyMod.CtrlCmd | m.monaco.KeyCode.Enter, () => cb.current.onRun())
      cb.current.onReady?.(made, m.monaco)
    }).catch(e => console.error('편집기를 불러오지 못했습니다', e))
    return () => { dead = true; made?.dispose(); ed.current = null }
  }, [])

  useEffect(sync, [lang, value])
  useEffect(() => { mod.current?.applyMonacoTheme(dark) }, [dark, themeName])

  return <div className="editor-host" ref={host} />
}
