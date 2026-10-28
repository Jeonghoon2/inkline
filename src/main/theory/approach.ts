// src/main/theory/approach.ts
// 접근 찾기 모듈 — ① 제약(limits.ts) → ② 비슷한 문제 → ③ 후보 쓰기(AI) → ④ 규칙 · 단서 대조 → ⑤ 실행 검산(AI + 격리 실행)
// 근거: 지식사전 프로그래밍 교육/competitive-programmers-handbook(①), LLM · API/can-language-models-solve-olympiad-programming(②),
//       학습 과학/categorization-and-representation-of-physics-problems-by-exp(단서), LLM · API/competitionlevel-code-generation-with-alphacode · codet(⑤)
import type { Approach, AiError, Limits, Problem, TheoryStage } from '../../shared/types.ts'
import { RANKS, rankIndex, normalizeKey, type Rank } from '../../shared/approach.ts'
import { arr, obj, str } from '../ai/schema.ts'
import { plainText, TAGS } from '../ai/classify.ts'
import { wrap } from '../tutor/context.ts'
import { supportReason } from '../practice/harness.ts'
import { anyOrderHint } from '../practice/compare.ts'
import type { Ask } from '../ai/run.ts'
import type { PyResult } from './sandbox.ts'
import { cleanApproaches } from './prompts.ts'
import { limitsOf } from './limits.ts'
import { t } from '../../shared/i18n.ts'


export const APPROACHES_SCHEMA = obj({
  approaches: arr(obj({
    name: str(40),
    nature: { type: 'string', enum: ['algorithm', 'datastructure', 'hybrid'] },
    complexity: { type: 'string', enum: [...RANKS] },
    clue: str(120),
    why: str(160),
    concepts: arr(obj({ key: str(40), name: str(40), nature: { type: 'string', enum: ['algorithm', 'datastructure'] }, tag: str(20) }), 1, 2)
  }), 2, 3)
})

export const problemText = (p: Problem): string => `제목: ${p.title.slice(0, 200)}\n${plainText(p.html).slice(0, 8000)}`

export function approachesPrompt(p: Problem, o: { keys: string[]; limits: Limits; similar: { title: string; approach: string }[]; issues?: string[] }): string {
  const L = o.limits
  const lim = L.source === 'text'
    ? `입력 제약:\n${L.lines.join('\n')}\n→ 가장 큰 입력 크기 N = ${L.n}, 시간 제한 1초 기준 허용 시간 복잡도 ${L.allowed} 이하`
    : L.source === 'ai' ? `입력 제약(추정): ${L.note}` : '입력 제약: 문제 글에서 직접 읽는다'
  return [
    wrap('problem', problemText(p)),
    lim,
    `이 문제를 풀 수 있는 접근 2~3개. 허용 시간 복잡도 안에서 통과하는 접근만 쓰고 브루트포스는 넣지 않는다. 각 접근:
- name: 짧은 이름
- nature: algorithm(알고리즘) / datastructure(순수 자료구조) / hybrid(혼합)
- complexity: 이 접근의 시간 복잡도, 목록 ${RANKS.join(' · ')} 중 하나(N = 가장 큰 입력 크기)
- clue: 이 접근을 떠올리게 하는 단서 문장 하나를 문제 글에서 **글자 그대로** 옮긴다(120자 이하, 고쳐 쓰지 않는다)
- why: 그 단서가 왜 이 개념을 부르는지 1~2문장. 처리 순서 · 반복 규칙 · 상한 · 자료 바꾸는 법 같은 풀이 절차와 코드는 쓰지 않는다(학습자가 아직 풀기 전이다)
- concepts: 배울 개념 1~2개, 알고리즘 · 자료구조 기법만(복잡도 · 구현 · 수학 일반은 개념이 아니다). hybrid 면 자료구조 개념 먼저. key 는 영어 소문자 kebab-case 일반 이름, name 은 한국어 이름, tag 는 다음 중 가장 가까운 하나 또는 빈 글: ${TAGS.join(', ')}
가장 자연스러운 접근을 첫째로. 서로 다른 개념을 쓰는 접근만 — 같은 개념을 이름만 바꾼 접근은 하나로.`,
    ...(o.keys.length ? [`이미 쓰는 개념 key(같은 개념이면 이 key 를 그대로): ${o.keys.slice(0, 40).join(', ')}`] : []),
    ...(o.similar.length ? [wrap('learner', `학습자가 예전에 푼 비슷한 문제:\n${o.similar.map(s => `- ${s.title.slice(0, 80)}${s.approach ? ` — 그때 고른 접근: ${s.approach.slice(0, 40)}` : ''}`).join('\n')}`)] : []),
    ...(o.issues?.length ? [`직전 답에서 뺀 후보와 까닭 — 다시 쓸 때 피한다:\n${o.issues.map(i => `- ${i}`).join('\n')}`] : [])
  ].join('\n\n')
}

const squash = (s: string): string => s.toLowerCase().replace(/[\s.,·:;'"“”‘’()[\]{}<>~!?。、\-–—`]/g, '')
export function clueFound(clue: string, text: string): boolean {
  const c = squash(clue)
  return c.length >= 4 && squash(text).includes(c)
}

export function ruleCheck(list: Approach[], o: { text: string; allowed: Rank | null }): { list: Approach[]; dropped: string[] } {
  const out: Approach[] = [], dropped: string[] = [], seen = new Set<string>(), names = new Set<string>()
  const cap = o.allowed ? rankIndex(o.allowed) : -1
  for (const a of list) {
    const set = a.concepts.map(c => normalizeKey(c.key)).sort().join('+')
    if (!a.clue || !clueFound(a.clue, o.text)) { dropped.push(`${a.name}: 단서가 문제 글에 그대로 없음(${(a.clue ?? '').slice(0, 40)})`); continue }
    if (cap >= 0 && a.complexity && rankIndex(a.complexity) > cap) { dropped.push(`${a.name}: ${a.complexity} 는 허용 ${o.allowed} 보다 느림`); continue }
    if (seen.has(set)) { dropped.push(`${a.name}: 앞 접근과 같은 개념(${set})`); continue }
    if (names.has(a.name)) { dropped.push(`${a.name}: 이름이 겹침`); continue }
    seen.add(set); names.add(a.name); out.push(a)
  }
  return { list: out, dropped }
}

export const CHECK_SCHEMA = obj({ brute: str(1500), gen: str(1000), solves: arr(str(2500), 1, 3) })

const pyParams = (p: Problem): string => p.signature!.params.map(q => q.name).join(', ')
export function checkPrompt(p: Problem, list: Approach[]): string {
  return [
    wrap('problem', problemText(p)),
    `함수 모양: (${pyParams(p)}) — 예제 입력 하나: ${JSON.stringify(p.examples[0]?.args).slice(0, 300)}`,
    `아래 접근마다 Python 참고 풀이를 쓴다. 이 코드는 학습자에게 보이지 않고, 접근이 맞는지 실행으로 확인하는 데만 쓴다.\n${list.map((a, i) => `${i + 1}. ${a.name} (${a.complexity ?? ''}) — ${a.why}`).join('\n')}`,
    ...(p.signature!.outParam !== undefined ? [`- 이 문제는 결과를 돌려주지 않고 매개변수 ${p.signature!.params[p.signature!.outParam]?.name}을(를) 그 자리에서 고친다 — solve · brute 도 원래 문제처럼 그 매개변수를 고치고, 검사기는 호출 뒤 그 매개변수를 읽는다`] : []),
    `- solves: 접근 순서대로, 각각 \`def solve(${pyParams(p)}):\` 하나. 보조 함수가 필요하면 solve 안에 정의한다
- brute: \`def brute(${pyParams(p)}):\` — 작은 입력에서 확실히 맞는 가장 단순한 풀이(모든 경우 시도)
- gen: \`def gen(rnd):\` — rnd(random.Random)로 brute 가 빨리 끝나는 작은 무작위 입력 하나를 만들어 인자 목록(list)으로 돌려준다. 문제 조건을 지키고, 답이 하나로 정해지는 입력만
- 규칙: 함수만 쓴다(class 금지). import 는 collections · heapq · math · itertools · functools · bisect 만. 밑줄로 시작하는 이름 · typing · open · eval · print 금지`
  ].join('\n\n')
}

const hasNode = (t: unknown): boolean => (typeof t === 'object' && t !== null ? hasNode((t as { array: unknown }).array) : t === 'ListNode' || t === 'TreeNode')
export function checkable(p: Problem): string | null {
  const why = supportReason(p, 'python3')
  if (why) return why
  const s = p.signature!
  if (hasNode(s.returns) || s.params.some(q => hasNode(q.type))) return t('ListNode · TreeNode 문제는 아직 검산하지 않습니다')
  return null
}

// 앞머리(prelude)는 random 을 준비하고, 뒷머리(postlude)가 brute · solve 를 예제와 무작위 입력 30개로 견준다 — AI 코드는 가운데
export function checkRun(p: Problem, _k: number): { prelude: string; postlude: string } {
  const ex = JSON.stringify(p.examples.map(e => [e.args, e.expected]))
  return {
    prelude: 'import json\nimport random as _random_mod\nfrom typing import List, Optional, Dict, Tuple, Set',
    postlude: `
_EX = json.loads(${JSON.stringify(ex)})
_OUT = ${p.signature!.outParam ?? 'None'}
_ANY = ${(p.classification?.anyOrder ?? anyOrderHint(p.html)) ? 'True' : 'False'}
def _k(v):
    return json.dumps(v, sort_keys=True)
def _n(v):
    v = json.loads(json.dumps(v))
    if _ANY and isinstance(v, list):
        return sorted([sorted(x, key=_k) if isinstance(x, list) else x for x in v], key=_k)
    return v
def _call(f, args):
    try:
        a = json.loads(json.dumps(args))
        r = f(*a)
        return True, _n(a[_OUT] if _OUT is not None else r)
    except Exception as e:
        return False, type(e).__name__
def _main():
    bok = 'ok'
    for a, want in _EX:
        ok, got = _call(brute, a)
        if not ok:
            bok = 'error'; break
        if _k(got) != _k(_n(want)):
            bok = 'bad'; break
    for a, want in _EX:
        ok, got = _call(solve, a)
        if not ok:
            return {"solve": "error", "brute": bok, "why": got}
        if _k(got) != _k(_n(want)):
            return {"solve": "fail", "brute": bok, "ex": {"args": a, "expected": want}}
    if bok == 'ok':
        rnd = _random_mod.Random(7)
        for _ in range(30):
            try:
                a = gen(rnd)
            except Exception:
                break
            ok, want = _call(brute, a)
            if not ok:
                continue
            ok, got = _call(solve, a)
            if not ok:
                return {"solve": "error", "brute": bok, "why": got}
            if _k(got) != _k(want):
                return {"solve": "fail", "brute": bok, "ex": {"args": a, "expected": want}}
    return {"solve": "pass", "brute": bok}
print(json.dumps(_main()))`
  }
}

export type RunOut = { solve: 'pass' | 'fail' | 'error'; brute: 'ok' | 'bad' | 'error'; ex?: { args: unknown[]; expected: unknown }; why?: string }
export function parseRun(lines: string[]): RunOut | null {
  for (const l of [...lines].reverse()) {
    try { const v = JSON.parse(l) as RunOut; if (v && (v.solve === 'pass' || v.solve === 'fail' || v.solve === 'error')) return v } catch { /* 다음 줄 */ }
  }
  return null
}

// AlphaCode 처럼 예제 · 무작위 대조로 거른다. 통과가 하나도 없으면 참고 풀이 쪽 실수일 수 있어 빼지 않고 '확인 못 함'으로 낮춘다
// ponytail: 답이 여럿인 문제(아무 유효 답)는 anyOrder 밖이면 brute 와 달라 '틀림'으로 볼 수 있다 — eval 에서 보이면 checker 를 더한다
export function judge(list: Approach[], outs: (RunOut | { error: string })[]): { list: Approach[]; dropped: string[]; fails: { name: string; ex?: RunOut['ex'] }[] } {
  const res = list.map((a, i) => ({ a, o: outs[i] ?? { error: '결과 없음' } }))
  const passAny = res.some(r => 'solve' in r.o && r.o.solve === 'pass')
  const fails = res.filter(r => 'solve' in r.o && r.o.solve === 'fail').map(r => ({ name: r.a.name, ex: (r.o as RunOut).ex }))
  const out: Approach[] = [], dropped: string[] = []
  for (const { a, o } of res) {
    if ('solve' in o && o.solve === 'pass') out.push({ ...a, check: { status: 'pass' } })
    else if ('solve' in o && o.solve === 'fail' && passAny) dropped.push(`${a.name}: 예제 · 무작위 입력에서 답이 다름`)
    else out.push({ ...a, check: { status: 'unknown', why: 'error' in o ? o.error.trim().split('\n').pop()!.slice(0, 80) : o.solve === 'fail' ? t('참고 풀이가 맞지 않아 확인하지 못함') : t('실행 오류 {s}', { s: o.why ?? '' }).trim() } })
  }
  return { list: out, dropped, fails }
}

export interface ApproachDeps {
  problem: Problem; ask: Ask
  runPy: (code: string, o: { prelude: string; postlude: string; maxCode: number; timeoutMs: number }) => Promise<PyResult>
  stage: (s: TheoryStage) => void
  keys: string[]; similar: { title: string; approach: string }[]
}
type Raw = { approaches: unknown[] }

export async function runApproaches(d: ApproachDeps): Promise<{ ok: true; list: Approach[]; check: unknown } | { ok: false; error: AiError }> {
  const p = d.problem
  const on = (id: TheoryStage['stage']): void => d.stage({ stage: id, state: 'on' })
  const done = (id: TheoryStage['stage'], note: string): void => d.stage({ stage: id, state: 'done', note })
  on('a-limits')
  const limits = limitsOf(p.html, p.classification?.complexityNote ?? '')
  done('a-limits', limits.source === 'text' ? t('N ≤ {n} → {c} 이하', { n: limits.n?.toLocaleString() ?? '', c: limits.allowed ?? '' }) : limits.source === 'ai' ? t('추정 · {s}', { s: limits.note.slice(0, 40) }) : t('제약 줄 없음'))
  on('a-similar')
  done('a-similar', d.similar.length ? t('예전에 푼 문제 {n}개', { n: d.similar.length }) : t('없음'))
  const text = plainText(p.html)
  let list: Approach[] = [], dropped: string[] = []
  for (let round = 1; round <= 2; round++) {
    on('a-write')
    const w = await d.ask<Raw>('approach-write', approachesPrompt(p, { keys: d.keys, limits, similar: d.similar, issues: dropped }), APPROACHES_SCHEMA)
    if (!w.ok) {
      if (w.error.code === 'aborted' || !list.length) return w
      done('a-write', t('다시 쓰기 실패 — 앞 결과로 진행')); break // 앞 라운드 목록으로 진행
    }
    const shaped = cleanApproaches(w.value, 1) ?? []
    done('a-write', `${t('후보 {n}개', { n: shaped.length })}${round > 1 ? ` · ${t('다시 씀')}` : ''}`)
    on('a-rules')
    const r = ruleCheck(shaped, { text, allowed: limits.allowed })
    list = r.list.length >= list.length ? r.list : list
    dropped = r.dropped
    done('a-rules', `${t('남음 {n}개', { n: r.list.length })}${r.dropped.length ? ` · ${t('뺌 {n}', { n: r.dropped.length })}` : ''}${r.list.length < 2 && round < 2 ? ` — ${t('다시 쓰기')}` : ''}`)
    if (r.list.length >= 2) break
  }
  if (!list.length) return { ok: false, error: { code: 'bad-output', message: t('접근을 찾지 못했습니다({s}) — 다시 시도해 주세요', { s: dropped.slice(0, 2).join(' / ') }) } }
  on('a-exec')
  const why = checkable(p)
  if (why) { done('a-exec', `${t('확인 못 함')} · ${why}`); return { ok: true, list: list.map(a => ({ ...a, check: { status: 'unknown', why } })), check: null } }
  const c = await d.ask<{ brute: string; gen: string; solves: string[] }>('approach-check', checkPrompt(p, list), CHECK_SCHEMA)
  if (!c.ok) {
    if (c.error.code === 'aborted') return c
    done('a-exec', `${t('확인 못 함')} · ${t('참고 풀이를 받지 못함')}`)
    return { ok: true, list: list.map(a => ({ ...a, check: { status: 'unknown', why: t('참고 풀이를 받지 못함') } })), check: null }
  }
  const outs: (RunOut | { error: string })[] = []
  for (let k = 0; k < list.length; k++) {
    const solve = c.value.solves[k]
    if (!solve) { outs.push({ error: t('참고 풀이 없음') }); continue }
    const r = await d.runPy([c.value.brute, c.value.gen, solve].join('\n\n'), { ...checkRun(p, k), maxCode: 8000, timeoutMs: 15000 })
    if (!r.ok && r.aborted) return { ok: false, error: { code: 'aborted', message: t('취소했습니다') } }
    outs.push(r.ok ? parseRun(r.lines) ?? { error: t('결과를 읽지 못함') } : { error: r.error })
  }
  const j = judge(list, outs)
  done('a-exec', `${t('통과 {a} · 확인 못 함 {b}', { a: j.list.filter(a => a.check?.status === 'pass').length, b: j.list.filter(a => a.check?.status === 'unknown').length })}${j.dropped.length ? ` · ${t('뺌 {n}', { n: j.dropped.length })}` : ''}`)
  return { ok: true, list: j.list, check: { code: c.value, outs, fails: j.fails, at: new Date().toISOString() } }
}
