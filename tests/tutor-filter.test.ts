import { test } from 'node:test'
import assert from 'node:assert/strict'
import { looksLikeCode, mentionsAlgorithm, cleanNudge, cleanHint, isWholeSolution } from '../src/main/tutor/filter.ts'

test('코드처럼 보이는 글', () => {
  for (const s of ['```py\nx=1\n```', 'def solve(a):', 'return answer', 'for i in range(n):', 'int x = 0;', 'if (a == b) {', 'arr.sort((a, b) => a - b)', 'answer = 0'])
    assert.equal(looksLikeCode(s), true, s)
  for (const s of ['예제 1 을 손으로 따라가 볼까요?', '두 합이 같아지는 순간을 찾아보세요.', '입력 크기가 30만이니 한 번 훑는 정도가 한계예요'])
    assert.equal(looksLikeCode(s), false, s)
})

test('알고리즘 이름', () => {
  assert.equal(mentionsAlgorithm('투 포인터로 양쪽에서 줄여 보세요'), true)
  assert.equal(mentionsAlgorithm('Try a sliding window'), true)
  assert.equal(mentionsAlgorithm('BFS 를 떠올려 보세요'), true)
  assert.equal(mentionsAlgorithm('예제 1 을 손으로 따라가 볼까요?'), false)
  assert.equal(mentionsAlgorithm('문자열을 앞에서부터 읽어 보세요'), false)
  assert.equal(mentionsAlgorithm('두 큐의 합을 비교해 보세요', '길이가 같은 두 개의 큐가 주어집니다'), false)
  assert.equal(mentionsAlgorithm('두 큐의 합을 비교해 보세요'), true)
})

test('넛지 정리', () => {
  assert.equal(cleanNudge({ text: '  예제 1 을 손으로 따라가 볼까요?  ' }), '예제 1 을 손으로 따라가 볼까요?')
  assert.equal(cleanNudge({ text: 'DP 표를 만들어 보세요' }), null)
  assert.equal(cleanNudge({ text: 'return 0 을 고쳐요' }), null)
  assert.equal(cleanNudge({ text: '가'.repeat(61) }), null)
})

test('힌트 정리', () => {
  assert.deepEqual(cleanHint(2, { text: '같은 원소를 몇 번 보나요?' }), { kind: 'text', text: '같은 원소를 몇 번 보나요?' })
  assert.equal(cleanHint(2, { text: 'while q: q.pop()' }), null)
  assert.equal(cleanHint(4, { text: 't', pseudo: Array(16).fill('줄').join('\n') }), null)
  assert.equal(cleanHint(5, { blocks: ['a', 'b'], distractors: [] }), null)
  assert.deepEqual(cleanHint(6, { snippet: 'x = 1  # 시작', note: 'n' }), { kind: 'snippet', snippet: 'x = 1  # 시작', note: 'n' })
})

test('한국어 문장은 코드가 아니다', () => {
  for (const s of ['if 합이 크면 어떻게 하나요?', 'for 문 안에서 몇 번 도나요?', 'return 값이 뭔가요?', 'while 이 언제 끝나나요?', 'else 경우는 어떤가요?', 'from 에서 to 까지 세어 보세요', 'int 범위를 넘지 않나요?', 'x == y 인 경우는요?'])
    assert.equal(looksLikeCode(s), false, s)
})

test('코드를 놓치지 않는다', () => {
  for (const s of ['answer += x', 'count++', 'a[i] += 1', 'dp[i] = dp[i-1] + 1', 'sorted(a)[0]', 'answer = 0 으로 초기화하세요'])
    assert.equal(looksLikeCode(s), true, s)
})

test('알고리즘 이름 변형', () => {
  for (const s of ['투포인터를 써 보세요', '이분탐색 해 보세요', '누적 합을 만드세요', 'use two-pointer', 'two pointers 로', 'stacks 를', 'queues 를', 'hashing 을', 'memoization 해 보세요', '재귀로 풀어 보세요', '큐를 써 보세요', '트리에서 찾아요'])
    assert.equal(mentionsAlgorithm(s), true, s)
  for (const s of ['큐브를 돌려 보세요', '트리거 조건을 보세요', '인덱스를 확인해 보세요'])
    assert.equal(mentionsAlgorithm(s), false, s)
})

test('힌트 정리: 빈 값 · 누락', () => {
  assert.equal(cleanHint(1, { text: '   ' }), null)
  assert.equal(cleanHint(3, { text: 't', concept: 'c' }), null)
  assert.equal(cleanHint(4, { text: 't' }), null)
  assert.equal(cleanHint(5, {}), null)
  assert.equal(cleanHint(6, {}), null)
  assert.notEqual(cleanHint(4, { text: 't', pseudo: '\n' + Array(15).fill('줄').join('\n\n') + '\n\n' }), null)
})

test('L6: 진입 함수 선언 + return 이면 전체 정답, 반복문 몸통만이면 부분', () => {
  const py = { name: 'solution', params: [], returns: 'int' } as never
  assert.equal(isWholeSolution('def solution(a):\n    t = 0\n    return t', py, 'python3'), true)
  assert.equal(isWholeSolution('for x in a:\n    t += x\nreturn t', py, 'python3'), false)
  assert.equal(isWholeSolution('def solution(a):\n    pass', py, 'python3'), false)
  const j = { name: 'solution', params: [], returns: 'int' } as never
  assert.equal(isWholeSolution('public int solution(int[] a) {\n  return 1;\n}', j, 'java'), true)
  assert.equal(isWholeSolution('for (int x : a) {\n  t += x;\n}\nreturn t;', j, 'java'), false)
  assert.equal(isWholeSolution('int r = solution(a);\nreturn r;', j, 'java'), false)
  assert.equal(isWholeSolution('if (a > b) {\n  return 1;\n}', null, 'java'), false)
  assert.equal(isWholeSolution('int f(int a) {\n  return 1;\n}', null, 'java'), true)
  assert.equal(mentionsAlgorithm('정렬된 배열을 떠올려요', ''), true)
  assert.deepEqual((cleanHint(5, { blocks: ['a = 1', '    s = 0', 'b = 2'], distractors: ['s = 0', 'c = 3'] }) as { distractors: string[] }).distractors, ['c = 3'])
  assert.equal(cleanHint(6, { snippet: 'def solution(a):\n    return 1', note: '' }, { sig: py, lang: 'python3' }), null)
})

test('넛지 이름 동의어 · 어미', () => {
  for (const s of ['해시맵을 써 보세요', '해시로 찾아 보세요', '딕셔너리에 담아 보세요', 'hashmap 을 써요', 'dict 에 담아요', '집합으로 바꿔 보세요', 'use a set', '정렬해 보세요', '정렬하면 쉬워요', '재귀적으로 생각해요', '메모이제이션을 해요', '두 포인터로', '투 포인터로', '다익스트라를 떠올려요', '이진 탐색을 해요', '이분 탐색을 해요', '깊이 우선으로 가요', '너비 우선으로 가요', '동적 계획법을 써요', '그리디하게 가요', '탐욕적으로 골라요'])
    assert.equal(mentionsAlgorithm(s), true, s)
  assert.equal(mentionsAlgorithm('정렬해 보세요', '배열을 정렬 후 출력하세요'), false)
  assert.equal(mentionsAlgorithm('settings 를 보세요'), false)
})

test('L5 파슨스: 진입 함수 선언 제거 · 방해 블록 중복 제거', () => {
  const ctx = { sig: { name: 'solution' } as never, lang: 'python3' as const }
  assert.deepEqual(cleanHint(5, { blocks: ['def solution(a):', 'x = 1', 'y = 2', 'z = 3'], distractors: ['x = 1', 'w = 0'] }, ctx), { kind: 'parsons', blocks: ['x = 1', 'y = 2', 'z = 3'], distractors: ['w = 0'] })
  assert.equal(cleanHint(5, { blocks: ['def f(a):', 'x = 1', 'y = 2'], distractors: [] }), null)
  assert.equal(cleanHint(5, { blocks: ['public int f(int a) {', 'x = 1', 'y = 2'], distractors: [] }), null)
})

test('isWholeSolution: sig 없음', () => {
  assert.equal(isWholeSolution('def f(a):\n    return 1', null, 'python3'), true)
  assert.equal(isWholeSolution('int f(int a) {\n  return 1;\n}', null, 'cpp'), true)
  assert.equal(isWholeSolution('t += 1\nreturn t', null, 'python3'), false)
})

test('L3 개념 · L4 의사코드 코드 거부', () => {
  const sk = [{ desc: '하나' }, { desc: '둘' }]
  assert.equal(cleanHint(3, { text: 't', concept: 'x = x + 1', skeleton: sk }), null)
  for (const p of ['```\nfoo\n```', 'a = 1;', 'while true {', 'def solve(a)', 'import os', '줄\nfunction f'])
    assert.equal(cleanHint(4, { text: 't', pseudo: p }), null, p)
  assert.notEqual(cleanHint(4, { text: 't', pseudo: '합을 구한다\n큰 쪽을 줄인다' }), null)
})

test('L3 concept 는 이름만 — 문장이면 다시 묻는다', () => {
  const sk = [{ label: '초기화', desc: '시작 상태를 정한다' }, { label: '종료', desc: '끝 조건을 본다' }]
  assert.notEqual(cleanHint(3, { text: '이유', concept: '백트래킹 + 비트마스크', skeleton: sk }), null)
  assert.equal(cleanHint(3, { text: '이유', concept: '백트래킹과 비트마스크를 사용한 탐색이 어울립니다', skeleton: sk }), null)
  assert.equal(cleanHint(3, { text: '이유', concept: '완전 탐색을 쓴다', skeleton: sk }), null)
})
