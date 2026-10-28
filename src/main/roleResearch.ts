// 직무 자료 수집 — 직무 이력서 · 자기소개서를 쓸 때 근거가 될 자료를 AI 가 웹에서 모으고, 앱이 출처 주소를 직접 열어 확인한 뒤
// work-history 스킬의 Knowledge/resume/<직무>/ 에 지금 4개 직무 자료와 같은 꼴로 쓴다. 자료가 있는 직무는 다시 모으지 않는다([자료 다시 모으기] 는 예외)
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { arr, obj, str, type JsonSchema } from './ai/schema.ts'
import type { AskResult } from './ai/run.ts'
import type { AiError } from '../shared/types.ts'
import { localDay } from '../shared/week.ts'
import { t } from '../shared/i18n.ts'


export const RESEARCH_SCHEMA = obj({
  label: str(40), // 직무 이름(한국어) — devops → 'DevOps 엔지니어'
  points: arr(str(300), 10), // 채용 쪽이 이력서에서 먼저 보는 것
  postings: arr(obj({ item: str(160), kind: { type: 'string', enum: ['자격요건', '우대사항'] }, seen: str(80) }), 14), // 국내 공고에 자주 나오는 요건
  resume: arr(str(300), 10), // 이력서 문장 꼴 · 성과 고르는 순서 · 기술 구역
  cover: arr(obj({ question: str(120), how: str(300) }), 8), // 자기소개서 문항별 쓰는 법
  checklist: arr(obj({ item: str(80), evidence: str(160), why: str(160) }), 15), // 경험 점검표 — 보완할 경험 판정
  sources: arr(obj({ title: str(200), url: str(500), kind: { type: 'string', enum: ['채용 쪽', '공고', '연구', '기사', '블로그'] }, note: str(200) }), 20)
})
export interface Research {
  label: string; points: string[]; postings: { item: string; kind: '자격요건' | '우대사항'; seen: string }[]; resume: string[]
  cover: { question: string; how: string }[]; checklist: { item: string; evidence: string; why: string }[]
  sources: { title: string; url: string; kind: string; note: string }[]
}

// 직무 이름 — 직접 더한 직무(devops 등)는 AI 가 이름을 정한다
export const ROLE_LABELS: Record<string, string> = { backend: '백엔드 엔지니어', frontend: '프론트엔드 엔지니어', 'data-engineer': '데이터 엔지니어', 'ai-engineer': 'AI 엔지니어' }

export const RESEARCH_SYSTEM = '너는 개발자 채용 자료를 조사한다. 웹을 검색하고 실제로 읽은 글만 근거로 쓴다. 한국어로 쓴다.'
export function researchPrompt(slug: string, label: string): string {
  return [
    `직무: ${label || slug} (파일 이름 '${slug}')`,
    '대상: 한국에서 이 직무로 이직하려는 경력 개발자. 이 사람이 이 직무 이력서와 자기소개서를 쓸 때 근거로 쓸 자료를 웹에서 찾는다.',
    '먼저 찾을 곳(위에서부터): 국내 기술 회사의 채용 · 기술 블로그와 면접관 · 채용 담당자 글, 지금 열린 국내 채용 공고(원티드 · 리멤버 · 회사 채용 페이지)의 자격요건 · 우대사항, 엔지니어링 리더의 글 · 책, 연구 · 설문. 이력서 템플릿 판매 · 검색 유입용 블로그는 다른 근거가 없을 때만',
    '- label: 이 직무의 한국어 이름',
    '- points: 이 직무 채용이 이력서에서 먼저 보는 것 5~10줄(한 줄 한 문장)',
    '- postings: 공고에 자주 나오는 요건 8~14개 — kind 는 자격요건 · 우대사항, seen 은 어느 공고에서 봤는지(회사 이름 등)',
    '- resume: 이 직무 이력서 쓰는 법 5~10줄 — 성과 고르는 순서, 성과 한 줄 꼴(결과 수치 → 무엇을 → 어떻게)의 이 직무 예, 기술 구역 나누는 법',
    '- cover: 자기소개서 문항(지원 동기 · 직무 역량 · 협업 · 문제 해결 등)마다 이 직무에서 무엇을 어떻게 쓰는지',
    '- checklist: 이 직무 경험 점검표 8~15개 — item(경험 이름), evidence(작업 기록에서 이 경험의 증거가 될 낱말들), why(어느 공고 · 자료에 나오는지)',
    '- sources: 실제로 열어 읽은 글만(6~20개) — 제목 · 주소(http/https 전체) · 종류 · 무엇을 얻었는지. 검색 결과 요약만 본 것은 note 앞에 \'검색 요약:\'',
    '수치 · 회사 이름 · 연도는 읽은 글에 있는 것만 쓴다. 지어내지 않는다. 남의 문장을 길게 옮기지 않고 요약한다'
  ].join('\n')
}

// 자료가 있는지 — 직무 폴더에 점검표나 채용 근거가 있으면 있는 것. 언제 모았는지는 파일 시각
export async function materialOf(dir: string): Promise<{ at: Date; sources: number } | null> {
  for (const f of ['hiring-side.md', 'checklist.md']) {
    const st = await stat(join(dir, f)).catch(() => null)
    if (st) {
      const text = await readFile(join(dir, 'hiring-side.md'), 'utf8').catch(() => '')
      return { at: st.mtime, sources: (text.match(/^\d+\. /gm) ?? []).length }
    }
  }
  return null
}

const cell = (t: string): string => t.replace(/\|/g, '/').replace(/\s+/g, ' ').trim()
// 지금 4개 직무 자료와 같은 파일 이름 — 최신화가 checklist · resume-patterns · hiring-side(요점)를 읽는다
export function materialFiles(r: Research, opened: boolean[], now: Date): Record<string, string> {
  const when = `조사 ${localDay(now)} · Inkline 이 웹 검색으로 모음`
  const src = r.sources.map((s, i) => `${i + 1}. ${s.title} — ${s.url} · ${s.kind} · ${opened[i] ? '열어 봄(앱 확인)' : '열리지 않음'}\n   - ${s.note}`).join('\n')
  return {
    'hiring-side.md': `# ${r.label} — 채용 쪽 근거 (${when})\n\n## 요점 — 이 직무 이력서는 이렇게 쓴다\n${r.points.map(p => `- ${p}`).join('\n')}\n\n## 출처\n${src}\n`,
    'job-posting-patterns.md': `# ${r.label} — 공고 패턴 (${when})\n\n## 자격요건\n${r.postings.filter(p => p.kind === '자격요건').map(p => `- ${p.item} (${p.seen})`).join('\n')}\n\n## 우대사항\n${r.postings.filter(p => p.kind === '우대사항').map(p => `- ${p.item} (${p.seen})`).join('\n')}\n`,
    'resume-patterns.md': `# ${r.label} — 이력서 패턴 (${when})\n\n${r.resume.map(p => `- ${p}`).join('\n')}\n`,
    'cover-letter-patterns.md': `# ${r.label} — 자기소개서 패턴 (${when})\n\n${r.cover.map(c => `## ${c.question}\n- ${c.how}`).join('\n\n')}\n`,
    'checklist.md': `# ${r.label} — 경험 점검표 (${when})\n\n| 항목 | 증거 키워드 | 근거 |\n| --- | --- | --- |\n${r.checklist.map(c => `| ${cell(c.item)} | ${cell(c.evidence)} | ${cell(c.why)} |`).join('\n')}\n`
  }
}

export type Ask = <T>(prompt: string, schema: JsonSchema) => Promise<AskResult<T>>
// 모으기: AI(웹 검색) → 출처 주소 열어 보기 → 파일 쓰기. 출처가 하나도 안 열리면 쓰지 않는다(지어낸 주소일 수 있다)
export async function gatherRole(o: { dir: string; slug: string; label: string; ask: Ask; probe: (url: string) => Promise<boolean>; now: Date }): Promise<{ ok: true; sources: number; opened: number; label: string; backup: string | null } | { ok: false; error: AiError }> {
  const r = await o.ask<Research>(researchPrompt(o.slug, o.label), RESEARCH_SCHEMA)
  if (!r.ok) return r
  const sources = r.value.sources.filter(s => /^https?:\/\/\S+$/.test(s.url))
  const opened = await Promise.all(sources.map(s => o.probe(s.url).catch(() => false)))
  if (!opened.some(Boolean)) return { ok: false, error: { code: 'bad-output', message: t('모은 자료의 출처 주소가 하나도 열리지 않아 쓰지 않았습니다 — 다시 모아 보세요') } }
  await mkdir(o.dir, { recursive: true })
  const files = materialFiles({ ...r.value, sources }, opened, o.now)
  // 있던 자료(손으로 검증해 모은 것일 수 있다)는 덮기 전에 _backup-<시각>/ 으로 옮겨 둔다
  const stamp = o.now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15), keep = join(o.dir, `_backup-${stamp}`)
  let backup: string | null = null
  for (const f of Object.keys(files)) {
    if (!(await stat(join(o.dir, f)).catch(() => null))) continue
    await mkdir(keep, { recursive: true })
    await copyFile(join(o.dir, f), join(keep, f))
    backup = keep
  }
  for (const [f, text] of Object.entries(files)) await writeFile(join(o.dir, f), text)
  return { ok: true, sources: sources.length, opened: opened.filter(Boolean).length, label: r.value.label, backup }
}
