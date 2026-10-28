// 기록 폴더 만들기 — node init.mjs [기록 폴더]   (기본 ~/My-History, 이미 있으면 진입 파일만 새로 쓰고 데이터는 건드리지 않는다)
// 폴더에는 데이터(기록·사전·보고·이력서·쇼츠 결과)만 두고, 코드는 이 스킬(site/)에 있다. 폴더의 build.mjs·serve.mjs 는 여기를 부르는 진입 파일
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const APP = dirname(fileURLToPath(import.meta.url))
const root = resolve(process.argv[2] ?? join(homedir(), 'My-History'))
mkdirSync(join(root, 'reports'), { recursive: true })

const entry = (file, what) => `// ${what}
// 코드는 work-history 스킬(${APP})에 있다. 이 파일은 그 스킬의 site/init.mjs 가 만든다(고치지 말고 init 을 다시 돌린다)
import { fileURLToPath } from 'node:url'
process.env.MH_ROOT = fileURLToPath(new URL('.', import.meta.url))
await import(${JSON.stringify(pathToFileURL(join(APP, file)).href)})
`
writeFileSync(join(root, 'build.mjs'), entry('build.mjs', '이 폴더의 기록으로 타임라인 페이지(index.html)를 만든다 — node build.mjs'))
writeFileSync(join(root, 'serve.mjs'), entry('serve.mjs', '이 폴더를 http://localhost:4173 으로 열고 쇼츠 만들기 요청을 받는다 — node serve.mjs'))

// 데이터 파일은 없을 때만 만든다 — 이미 쓴 기록·사전을 덮지 않는다
const seed = {
  'concepts.md': '# 개념 사전\n\n기록의 `==글자|개념 이름==` 이 가리키는 개념. `## 이름` / 원리 문단 / `- Q: 질문` + `  A: 답`\n',
  'README.md': `# My History

작업 기록 모음. Claude Code 스킬 \`work-history\` 가 쌓고 \`index.html\`(타임라인)로 모아 본다.
이 폴더에는 데이터만 있다. 페이지·서버 코드와 디자인 규칙·이력서 원칙은 스킬에 있다(\`build.mjs\`·\`serve.mjs\` 는 스킬을 부르는 진입 파일).

## 카테고리
| 카테고리 | 대상 |
|---|---|

새 프로젝트는 저장소(폴더) 이름으로 카테고리를 만들고 이 표에 한 줄 추가한다.
`,
}
for (const [f, text] of Object.entries(seed)) if (!existsSync(join(root, f))) writeFileSync(join(root, f), text)
// 자기를 돌린 node 로 — Inkline 앱은 따로 깐 node 없이 앱에 든 node(ELECTRON_RUN_AS_NODE)로 부른다
execFileSync(process.execPath, [join(root, 'build.mjs')], { stdio: 'inherit' })
console.log(`기록 폴더 준비 끝: ${root}`)
