import { useEffect, useState } from 'react'

// App 의 applyTheme 이 <html data-theme · data-scheme> 를 채운다. 그 전(첫 그림)에는 시스템 설정을 따른다
const read = (): { name: string; dark: boolean } => {
  const el = document.documentElement
  return { name: el.dataset.theme ?? '', dark: el.dataset.scheme ? el.dataset.scheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches }
}

// 테마 이름이 바뀌면(어두운 테마끼리여도) 다시 그린다 — 코드 편집기 바탕을 --main 에 맞추려고
export function useTheme(): { name: string; dark: boolean } {
  const [t, setT] = useState(read)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = (): void => setT(read())
    mq.addEventListener('change', on)
    const mo = new MutationObserver(on)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-scheme'] })
    return () => { mq.removeEventListener('change', on); mo.disconnect() }
  }, [])
  return t
}
