import { spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { homedir } from 'node:os'

// 스킬이 언제 기록할지는 각 AI 도구의 전역 지침이 정한다 — 이 맥의 ~/.claude/CLAUDE.md · ~/.codex/AGENTS.md 와 같은 두 줄
export const GLOBAL_RULES = `- 작업 기록: \`work-history\` 스킬(~/.claude/skills/work-history)의 \`rules.json\`(Inkline 앱 환경설정에서 고침)이 정한 때를 마치면 그 스킬의 SKILL.md 를 따라 ~/My-History에 기록을 남긴다. 파일이 없으면 기본값 — 브랜치 머지(통합 브랜치·main)·배포(릴리스·태그)·트러블슈팅 해결. 그 밖의 작업은 사용자가 요청할 때만.
- 지식사전: 설계 · 방식 고르기 · 도메인 규칙이 걸린 작업이면 \`knowledge\` 스킬(~/.claude/skills/knowledge)을 따라 ~/My-History/knowledge/INDEX.md 를 먼저 찾아 참고하고, 작업 중 판단 근거로 쓴 논문 · 사례 · 지침 · 문헌은 그 스킬 형식으로 저장한다(출처 · 쪽은 확인한 것만).
`
const BUNDLE = '.inkline-bundle' // skills:bundle 이 빌드 때 스킬마다 시각을 적는다
const KEEP = /^(rules\.json$|Knowledge([\\/]|$))/
const stamp = (dir: string): string => { try { return readFileSync(join(dir, BUNDLE), 'utf8').trim() } catch { return '' } }
const TOOLS = [['.claude', 'CLAUDE.md'], ['.codex', 'AGENTS.md'], ['.gemini', 'GEMINI.md']] as const

// 새 PC 에서 처음 켜면 앱에 넣어 간 스킬(work-history · knowledge · concept-shorts)을 ~/.claude/skills 에 깐다.
// 앱이 깐 스킬(표 .inkline-bundle 이 있음)은 새 앱의 것으로 바꾼다 — 그래야 스킬을 고친 것이 다시 설치로 닿는다.
// 그때도 사용자 설정(rules.json)과 직무 자료(Knowledge/)는 둔다. 표가 없는 스킬은 사용자가 만든 것이라 건드리지 않는다
// Codex · Gemini 가 깔려 있으면 같은 폴더를 가리키는 링크를 만든다(junction 은 Windows 에서 관리자 권한이 없어도 된다)
export function installSkills(src: string, home = homedir(), rules = true): void {
  if (!existsSync(src)) return
  for (const name of readdirSync(src)) {
    const dest = join(home, '.claude', 'skills', name)
    try {
      if (!existsSync(dest)) cpSync(join(src, name), dest, { recursive: true })
      else if (stamp(dest) && stamp(dest) !== stamp(join(src, name)))
        cpSync(join(src, name), dest, { recursive: true, filter: (_f, to) => !(existsSync(to) && KEEP.test(relative(dest, to))) })
      for (const [tool] of TOOLS.slice(1)) {
        if (!existsSync(join(home, tool))) continue
        const link = join(home, tool, 'skills', name)
        if (existsSync(link)) continue
        mkdirSync(dirname(link), { recursive: true })
        symlinkSync(dest, link, 'junction')
      }
    } catch { /* 깔지 못해도 앱은 뜬다 — 환경설정에 '스킬이 없습니다'로 보인다 */ }
  }
  // 전역 지침은 사용자가 처음 켤 때 고른 경우에만, 덧붙이기만 한다 — 이미 work-history 를 말하고 있으면 사용자가 쓴 것이라 그대로 둔다
  if (!rules) return
  for (const [tool, file] of TOOLS) {
    if (tool !== '.claude' && !existsSync(join(home, tool))) continue
    const f = join(home, tool, file)
    try {
      const cur = existsSync(f) ? readFileSync(f, 'utf8') : ''
      if (cur.includes('work-history')) continue
      mkdirSync(dirname(f), { recursive: true })
      appendFileSync(f, `${cur && !cur.endsWith('\n') ? '\n' : ''}${cur ? '\n' : '# 전역 지침\n\n'}${GLOBAL_RULES}`)
    } catch { /* 못 써도 스킬은 깔렸다 — 사용자가 "기록해 줘"라고 하면 남는다 */ }
  }
}

// 새 PC 에는 기록 폴더가 없다 — 깔아 둔 work-history 의 init.mjs 로 뼈대(README · concepts.md · reports/ · 빈 페이지)를 만든다.
// 이미 있으면 건드리지 않는다. 감시를 걸기 전에 있어야 해서 기다린다(빈 폴더라 1초 안쪽)
export function ensureHistory(root: string, home = homedir()): void {
  const init = join(home, '.claude', 'skills', 'work-history', 'site', 'init.mjs')
  if (existsSync(root) || !existsSync(init)) return
  const r = spawnSync(process.execPath, [init, root], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 30_000, encoding: 'utf8' })
  if (r.status !== 0) console.error('기록 폴더를 만들지 못했다', r.error ?? r.stderr) // 그래도 앱은 뜬다 — 작업 기록 탭이 '기록 폴더가 없습니다'로 보인다
}
