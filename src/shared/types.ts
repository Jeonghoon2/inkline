import type { Rank } from './approach.ts'
import type { CertApi } from './cert.ts'
import type { Scene } from './scene.ts'
import type { DrillRow, Grade } from './drill.ts'
import type { KItem, KnowledgeData } from './knowledge.ts'

// main · preload · renderer 가 같이 쓰는 타입. 런타임 코드는 DEFAULT_SETTINGS 하나만 둔다

export type AiCli = 'claude' | 'gemini' | 'codex'
// yes: 스킬과 전역 지침 두 줄, skills: 스킬만, no: 아무것도 깔지 않는다
export type SetupInstall = 'ask' | 'yes' | 'skills' | 'no'
export const SETUP_INSTALLS: SetupInstall[] = ['ask', 'yes', 'skills', 'no']
import type { Theme, ThemeName } from './themes.ts'
import type { UiLangPref } from './i18n.ts'
export type { Theme, ThemeName }
export type Site = 'programmers' | 'leetcode'
export type Lang = 'python3' | 'java' | 'javascript' | 'cpp'

export interface Settings {
  'ai.cli': AiCli | null
  'ai.model': string // '' = CLI 기본값
  'ai.effort': string // '' = CLI 기본값
  historyRoot: string // 작업 기록 폴더 (기본 ~/My-History)
  'ui.lang': UiLangPref // 화면과 AI 결과 언어
  'setup.install': SetupInstall // 처음 켤 때 고른 스킬 설치 범위 — ask 면 아직 묻지 않았다
  theme: Theme
  'theme.light': ThemeName // '시스템 설정'일 때 맥이 밝으면 쓰는 테마
  'theme.dark': ThemeName // 맥이 어두우면 쓰는 테마
  'nudge.enabled': boolean
  'nudge.quietMs': number // 문제를 연 뒤 넛지를 띄우지 않는 시간
  'nudge.idleMs': number // 이만큼 입력 · 실행이 없으면 넛지
  'run.timeoutMs': number // 예제 하나 실행 제한
  'coding.lang': Lang // 코드 칸에 처음 깔 언어
  'report.excluded': string[] // 주간 보고에서 뺄 프로젝트(작업 기록 카테고리) — 새 프로젝트는 저절로 들어간다
  'history.personal': string[] // 개인 작업인 프로젝트(작업 기록 카테고리) — 이력서에서 회사 경력과 가르고 소속을 '개인'으로
  'resume.backupThrough': Record<string, string> // 백업 파일 이름 → 그 백업을 만들기 전의 through(없었으면 '')
  'resume.through': Record<string, string> // 이력서(base · 직무 slug)마다 최신화에 반영한 마지막 기록 날짜
  'resume.photo': string // 이력서 머리의 사진(data:image/... URL, 작게 줄인 것). '' = 없음
}

// historyRoot 는 홈 폴더를 아는 main 이 채운다
export const DEFAULT_SETTINGS: Omit<Settings, 'historyRoot'> = {
  'ai.cli': null,
  'ai.model': '',
  'ai.effort': '',
  'ui.lang': 'system',
  'setup.install': 'ask',
  theme: 'system',
  'theme.light': 'light',
  'theme.dark': 'dark',
  'nudge.enabled': true,
  'nudge.quietMs': 120_000,
  'nudge.idleMs': 60_000,
  'run.timeoutMs': 3_000,
  'coding.lang': 'python3',
  'report.excluded': [],
  'history.personal': [],
  'resume.through': {},
  'resume.backupThrough': {},
  'resume.photo': ''
}

export const AI_CLIS: AiCli[] = ['claude', 'gemini', 'codex']
export const LANGS: Lang[] = ['python3', 'java', 'javascript', 'cpp']
export const LANG_LABEL: Record<Lang, string> = { python3: 'Python', java: 'Java', javascript: 'JavaScript', cpp: 'C++' }
// 언어 실행기. java 는 javac(컴파일) + java(실행) 둘 다 있어야 쓸 수 있다
export const RUNNERS = ['python3', 'node', 'javac', 'java', 'g++']
export const LANG_RUNNERS: Record<Lang, string[]> = { python3: ['python3'], javascript: ['node'], java: ['javac', 'java'], cpp: ['g++'] }

export interface ToolInfo {
  id: string
  path: string | null
  version: string | null // null 이면 '없음' (껍데기 실행 파일 포함)
}
export interface Tools {
  ai: ToolInfo[]
  runners: ToolInfo[]
}
export interface ModelInfo {
  id: string // CLI 에 넘기는 이름
  label?: string // 목록에 보일 이름(예: Opus 5.5) — 없으면 id
  aliases?: string[] // 예전에 저장한 별칭도 이 모델로 알아본다
  efforts: string[] // 빈 배열이면 노력 수준을 고르지 않는다
}

export interface Tag { major: string; minor: string }
export interface Entry { category: string; date: string; title: string; type: string; tags: Tag[]; body: string; sections: Record<string, string> }
export interface Concept { why: string; qs: { q: string; a: string }[] }
export interface Report { name: string; text: string }
export type ResumeChangeKind = 'add' | 'replace' | 'remove'
export interface ResumeEvidence { ref: string; quote: string } // ref: 카테고리/YYYY-MM.md#YYYY-MM-DD
export interface ResumeChange { kind: ResumeChangeKind; where: string; before: string; after: string; anchor: string; why: string; shipped: boolean; evidence: ResumeEvidence[] } // shipped: 근거 기록에 운영 배포가 적혀 있다
export interface ResumeSkip { title: string; why: string }
// 기본 이력서 머리 + 지금(가장 최근) 경력 — 온보딩. start · end 는 'YYYY.MM', end '' = 재직 중, company '' = 경력 없음(경력 칸은 건드리지 않는다)
export interface CvHead { name: string; email: string; phone: string; github: string; portfolio: string; company: string; title: string; start: string; end: string }
// 최신화 · 점검 진행 단계 — main 이 모듈을 시작(on) · 마칠(done) 때마다 보낸다. note 는 그 모듈의 결과 한 줄
// 최신화: read · records → judge → write → verify → screen / 점검: read · records → risk ‖ extra → rewrite → rules
export type ResumeStageId = 'read' | 'records' | 'research' | 'judge' | 'write' | 'polish' | 'verify' | 'screen' | 'risk' | 'extra' | 'rewrite' | 'rules'
export interface ResumeStage { stage: ResumeStageId; state: 'on' | 'done'; note?: string }
export interface CheckedChange extends ResumeChange { id: number; blocked: string | null; warnings: string[] }
export type ResumeUpdateResult =
  | { ok: true; changes: CheckedChange[]; skipped: ResumeSkip[]; through: string; count: number; total: number; noGuide: boolean; risky: { line: string; words: string[] }[] } // count: 새 기록 수, total: 읽은 전체 기록 수, risky: 점검이 고치지 않은 줄 중 불리할 수 있는 말
  | { ok: false; error: AiError }
export interface Role { slug: string; text: string }
export interface HistoryData {
  root: string
  exists: boolean
  entries: Entry[] // 날짜 내림차순
  reports: Report[] // 이름 내림차순
  resume: string
  roles: Role[] // slug 오름차순
  concepts: Record<string, Concept>
  shorts: string[] // shorts/<slug>.mp4 가 있는 개념 이름
  loadedAt: string // ISO
}
// 쇼츠 만들기 한 편 — step 은 엔진이 내는 단계 글자('대본 쓰는 중' 등)
export type ShortJob = { state: 'queued' } | { state: 'running'; step: string } | { state: 'done' } | { state: 'failed'; error: string }

// 예제 실행용 공통 타입 (계획 4 의 감싸는 코드가 쓴다). 모르는 타입은 'unknown'
export type TypeSpec = 'int' | 'long' | 'double' | 'bool' | 'string' | 'char' | 'ListNode' | 'TreeNode' | 'unknown' | { array: TypeSpec; list?: true }
export interface Signature { name: string; params: { name: string; type: TypeSpec }[]; returns: TypeSpec; outParam?: number }
export interface Example { args: unknown[]; expected: unknown }
export type Nature = 'algorithm' | 'datastructure' | 'hybrid'
export type TheoryPart = 'theory' | 'map'
// tag 는 고정 태그 25개 중 하나이거나 ''
export interface ConceptRef { key: string; name: string; nature: 'algorithm' | 'datastructure'; tag: string }
// 실행 검산 결과(카드에 보이는 것만 — 참고 풀이 코드는 main 의 approach_check 열에만)
export interface ApproachCheck { status: 'pass' | 'unknown'; why?: string }
// concepts 1~2개, hybrid 면 2개(자료구조 먼저). complexity · clue · check 는 2026-10-21 뒤 분석부터(옛 저장값엔 없다)
export interface Approach { name: string; nature: Nature; why: string; concepts: ConceptRef[]; complexity?: Rank; clue?: string; check?: ApproachCheck }

export interface SceneSet { summary: string[]; scenes: Scene[] }
export interface ChosenApproach { name: string; complexity: Rank | ''; concepts: { key: string; name: string }[]; clue: string }
export interface TheoryLog { own: string; approach: ChosenApproach | null; explain: string; at: string }
// ① 제약 읽기 결과 — lines: 문제의 제약 줄, n: 크기 줄의 가장 큰 상한, allowed: 1초 기준 허용 복잡도
export interface Limits { lines: string[]; n: number | null; allowed: Rank | null; source: 'text' | 'ai' | 'none'; note: string }
export type TheoryResult = { ok: true; set: SceneSet; cached: boolean } | { ok: false; error: AiError }
// 이론 장면 만들기 단계 — 개념: design → exec → write → quality → check / 문제 연결: write → quality → check
export type TheoryStageId = 'design' | 'exec' | 'write' | 'quality' | 'check' | 'a-limits' | 'a-similar' | 'a-write' | 'a-rules' | 'a-exec'
export interface TheoryStage { stage: TheoryStageId; state: 'on' | 'done'; note?: string }
export interface ProblemDraft {
  site: Site
  siteId: string
  url: string // 정규화한 주소
  title: string
  html: string // 문제 본문 HTML (정리 전 원본, 이미지는 data URI)
  examples: Example[]
  starter: Partial<Record<Lang, string>>
  signature: Signature | null // 예제 실행에 쓸 수 없으면 null
  siteLevel: string // 'Lv. 2' · 'Easy' 같은 사이트 표기
  siteTags: string[] // 사이트 원래 태그 이름
}
export interface Classification { difficulty: number; tags: string[]; nature: Nature; complexityNote: string; anyOrder: boolean }
export interface Problem extends ProblemDraft { id: number; classification: Classification | null; createdAt: string }
export interface ProblemSummary { id: number; site: Site; title: string; url: string; siteLevel: string; classification: Classification | null; createdAt: string }
export type AiErrorCode = 'no-cli' | 'not-installed' | 'timeout' | 'cli-error' | 'bad-output' | 'aborted' | 'not-found' | 'busy' // busy: 모델이 붐빔(다른 모델을 고르게)
export interface AiError { code: AiErrorCode; message: string }
export type ImportResult =
  | { ok: true; problem: Problem; existed: boolean }
  | { ok: false; reason: 'bad-url' | 'need-login' | 'not-found' | 'parse-failed' | 'fetch-failed'; site?: Site; url?: string; message: string }

export type Stage = 'understand' | 'plan' | 'implement' | 'debug' | 'reflect'
export const STAGES: Stage[] = ['understand', 'plan', 'implement', 'debug', 'reflect']
export const STAGE_LABEL: Record<Stage, string> = { understand: '이해', plan: '계획', implement: '구현', debug: '디버깅', reflect: '회고' }
export interface Attempt { id: number; problemId: number; mode: 'learn' | 'review'; lang: Lang; code: Partial<Record<Lang, string>>; stage: Stage; stageMs: Partial<Record<Stage, number>>; predicted: string | null; passed: boolean; startedAt: string; endedAt: string | null }

export interface Api {
  settings: {
    all(): Promise<Settings>
    set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void>
  }
  tools: {
    detect(): Promise<Tools>
    models(cli: AiCli): Promise<ModelInfo[]>
  }
  dialog: { pickFolder(defaultPath?: string): Promise<string | null> }
  shell: { openPath(path: string): Promise<void> }
  app: { dataDir(): Promise<string>; titleBar(color: string, symbol: string): Promise<void> }
  history: {
    load(): Promise<HistoryData>
    rules(): Promise<RecordRules | null> // work-history 스킬이 없으면 null
    setRules(r: RecordRules): Promise<RecordRules>
    onChanged(cb: () => void): () => void // 구독 해제 함수
  }
  shorts: {
    make(name: string): Promise<ShortJob>
    jobs(): Promise<Record<string, ShortJob>> // 이번에 켠 뒤 만든 · 만드는 중인 것만
    onChanged(cb: () => void): () => void
  }
  resume: {
    savePdf(defaultName: string): Promise<{ path: string; pages: number } | null> // 저장한 경로 · 쪽 수, 취소면 null
    since(slug: string): Promise<string | null> // 이 날짜(포함) 이후 기록이 대상 — 이력서 파일이 없으면 null
    update(slug: string): Promise<ResumeUpdateResult>
    review(slug: string): Promise<ResumeUpdateResult> // 불리 · 불필요한 줄 점검 — 고쳐 쓰기 · 빼기만
    onStage(cb: (s: ResumeStage) => void): () => void // 구독 해제 함수
    head(): Promise<CvHead> // 기본 이력서의 이름 · 연락처(파일이 없으면 빈 값)
    setHead(h: CvHead): Promise<void> // 머리만 바꾸고(이전 판 백업), 파일이 없으면 뼈대로 만든다
    addRole(slug: string): Promise<boolean> // 직무 이력서 뼈대를 만든다(있으면 그대로 두고 false)
    research(slug: string): Promise<{ ok: true; sources: number; opened: number; label: string; backup: string | null } | { ok: false; error: AiError }> // [자료 다시 모으기] — 있던 자료는 backup 폴더로
    cancel(): Promise<void>
    save(slug: string, changes: ResumeChange[], through: string): Promise<{ applied: number; skipped: number }> // through '' = 최신화 날짜는 그대로(점검)
    backups(slug: string): Promise<{ name: string; at: string }[]> // 이 이력서의 이전 판, 최신순
    restore(slug: string, name: string): Promise<void> // 지금 판을 먼저 백업하고 되돌린다
  }
  reports: {
    make(week: string, cats: string[], audience: 'dev' | 'nondev' | 'company'): Promise<{ ok: true; text: string; count: number } | { ok: false; error: AiError }>
    save(name: string, text: string, overwrite: boolean): Promise<{ saved: boolean; exists: boolean }> // name: YYYY-Www · YYYY-Www-비개발자 · YYYY-Www-회사
    cancel(): Promise<void>
    rename(from: string, to: string): Promise<void>
    remove(name: string): Promise<void> // 휴지통으로
  }
  knowledge: {
    load(): Promise<KnowledgeData>
    save(item: KItem, prev: { category: string; slug: string } | null, pdf?: string): Promise<KItem> // pdf = 초안 때 받은 임시 PDF 경로
    remove(category: string, slug: string): Promise<void> // 휴지통으로
    draft(input: { url: string; text: string; pdfPath?: string }): Promise<{ ok: true; item: KItem; pdf?: string } | { ok: false; error: AiError }>
    pickPdf(): Promise<string | null>
    browse(category: string, slug: string): Promise<void> // 앱 안 창에서 원문을 열어 받은 PDF 를 자동으로 붙인다
    attach(category: string, slug: string, path: string): Promise<KItem> // 있는 항목에 원문 PDF 붙이기
    openFile(category: string, file: string): Promise<void>
    pathForFile(f: File): string
    cancelDraft(): Promise<void>
  }
  coding: {
    import(url: string): Promise<ImportResult>
    login(site: Site): Promise<void> // 로그인 창을 닫으면 끝난다
    list(): Promise<ProblemSummary[]>
    passedIds(): Promise<number[]>
    statuses(): Promise<Record<number, ProblemStatus>>
    get(id: number): Promise<Problem | null>
    classify(id: number): Promise<Classification | AiError>
    onChanged(cb: () => void): () => void
  }
  practice: {
    start(problemId: number, lang: Lang, mode: 'learn' | 'review'): Promise<Attempt>
    finish(attemptId: number, sitePassed: boolean, reflection: Reflection | null): Promise<SessionReport>
    giveUp(attemptId: number): Promise<void> // review 시도만
    report(attemptId: number): Promise<SessionReport | null>
    save(attemptId: number, lang: Lang, code: string): Promise<void>
    stage(attemptId: number, stage: Stage, addMs: Partial<Record<Stage, number>>): Promise<void>
    predict(attemptId: number, text: string): Promise<void>
    run(attemptId: number, lang: Lang, code: string): Promise<RunResult>
    support(problemId: number, lang: Lang): Promise<string | null> // 예제 실행을 못 하는 이유, 되면 null
    cancelRun(): Promise<void>
    cases(problemId: number): Promise<CustomCase[]>
    addCase(problemId: number, args: unknown[], expected: unknown): Promise<CustomCase>
    removeCase(id: number): Promise<void>
    lastRun(attemptId: number): Promise<RunResult | null>
  }
  drill: { state(): Promise<DrillRow[]>; grade(concept: string, q: number, grade: Grade): Promise<DrillRow[]> }
  review: { due(): Promise<DueItem[]> }
  tutor: {
    nudge(attemptId: number, code: string, stage: Stage): Promise<string | null> // 실패 · 걸러짐 → 고정 문장, 취소 · 꺼짐 · 같은 코드 → null
    hints(attemptId: number): Promise<Hint[]>
    nextHint(attemptId: number, code: string, stage: Stage, selfExplain: string | null): Promise<Hint | AiError | { gate: string }>
    answerStage(hintId: number, stage: Stage): Promise<void> // L0 의 답
    mistakes(problemId: number): Promise<Mistake[]>
    mistakeBook(): Promise<MistakeGroup[]>
    onMistakes(cb: () => void): () => void
  }
  theory: {
    onStage(cb: (s: TheoryStage) => void): () => void // 이론 장면 만들기 단계(구독 해제 함수)
    approaches(attemptId: number, refresh: boolean): Promise<{ ok: true; list: Approach[] } | { ok: false; error: AiError }>
    scenes(attemptId: number, concept: ConceptRef, part: TheoryPart, firstTry: string, refresh: boolean): Promise<TheoryResult>
    limits(attemptId: number): Promise<Limits>
    cancel(): Promise<void> // 진행 중인 approaches · scenes 요청을 모두 취소
    familiar(attemptId: number, tag: string): Promise<number>
    choose(attemptId: number, pick: { index: number; own: string; name: string }): Promise<TheoryLog> // 고르는 순간 저장
    chosen(attemptId: number): Promise<TheoryLog | null>
    log(attemptId: number, explain: string): Promise<void>
  }
  cert: CertApi
}

export type RunStatus = 'pass' | 'fail' | 'error' | 'timeout'
export interface ExampleResult { index: number; status: RunStatus; expected: unknown; actual: unknown; stdout: string; stderr: string; ms: number; custom?: { id: number; args: unknown[] } }
export interface CustomCase { id: number; args: unknown[]; expected: unknown }
export interface RunResult { lang: Lang; compileError: string | null; unsupported: string | null; results: ExampleResult[]; passed: boolean; aborted: boolean }

export type HintLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6
export const HINT_LABEL: Record<HintLevel, string> = { 0: '지금 어디쯤', 1: '문제 다시 보기', 2: '질문 하나', 3: '쓸 개념', 4: '뼈대', 5: '순서 맞추기', 6: '핵심 코드' }
export type HintBody =
  | { kind: 'stage'; question: string; answer: Stage | null } // L0 — AI 없이 고정 질문, 사용자가 고른 단계
  | { kind: 'text'; text: string } // L1 · L2
  | { kind: 'concept'; text: string; concept: string; skeleton: { label: '초기화' | '탐색 조건' | '상태 갱신' | '종료 · 반환'; desc: string }[] } // L3
  | { kind: 'pseudo'; text: string; pseudo: string } // L4
  | { kind: 'parsons'; blocks: string[]; distractors: string[] } // L5 — blocks 가 정답 순서
  | { kind: 'snippet'; snippet: string; note: string } // L6
export interface Hint { id: number; attemptId: number; level: HintLevel; body: HintBody; selfExplain: string | null; at: string }
export type MistakeType = 'offbyone' | 'boundary' | 'overflow' | 'timeout' | 'type' | 'input' | 'init' | 'logic'
export const MISTAKE_LABEL: Record<MistakeType, string> = { offbyone: '하나 차이(off-by-one)', boundary: '경계 조건', overflow: '오버플로', timeout: '시간 초과', type: '자료형', input: '입력 해석', init: '초기화 누락', logic: '로직 오류' }
export interface Mistake { id: number; attemptId: number; problemId: number; type: MistakeType; line: number | null; note: string; at: string }
export interface MistakeGroup { type: MistakeType; count: number; items: (Mistake & { title: string })[] }

export interface Reflection { idea: string; complexity: string; mistake: string }
export type ProblemStatus = { kind: 'new' } | { kind: 'solving' } | { kind: 'passed' } | { kind: 'review'; dueAt: string; step: number } | { kind: 'mastered' }
export interface DueItem { problemId: number; title: string; dueAt: string; step: number; maxHint: number } // maxHint: learn 시도에서 쓴 가장 높은 힌트 단계, 없으면 -1
export interface SessionReport {
  attemptId: number
  mode: 'learn' | 'review'
  stageMs: Partial<Record<Stage, number>>
  hints: { level: HintLevel; atMs: number }[]
  runs: number
  firstPassMs: number | null
  predicted: string | null
  predictedRight: boolean | null
  theory: TheoryLog | null
  totalMs: number
  next: { dueAt: string; step: number } | 'mastered' | null
  previous: { at: string; reflection: Reflection | null; selfExplains: string[]; theory: TheoryLog | null } | null // 복습 리포트만: 같은 문제의 마지막으로 끝난 learn 시도
}

// 작업 기록(work-history 스킬)을 자동으로 남기는 때 — 앱이 스킬 폴더의 rules.json 에 쓰고, 스킬이 읽어 따른다
export const RECORD_RULES = [
  { key: 'mergeMain', label: 'main(기본 브랜치)에 머지했을 때' },
  { key: 'mergeIntegration', label: '통합 브랜치(develop 등)에 머지했을 때' },
  { key: 'release', label: '배포(릴리스 · 태그)를 마쳤을 때' },
  { key: 'troubleshooting', label: '장애 · 예상 못 한 실패를 해결해 배포까지 마쳤을 때 (트러블슈팅 따로 한 건)' },
  { key: 'taskDone', label: '머지 · 배포가 없어도 코드 작업 하나를 마칠 때마다 (질문 · 조사는 빼고)' }
] as const
export type RecordRuleKey = (typeof RECORD_RULES)[number]['key']
export type RecordRules = Record<RecordRuleKey, boolean>
export const DEFAULT_RECORD_RULES: RecordRules = { mergeMain: true, mergeIntegration: true, release: true, troubleshooting: true, taskDone: false }
