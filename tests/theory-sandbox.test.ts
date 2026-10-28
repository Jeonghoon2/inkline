import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { canSandbox, pyRisk, runPy, PY_GUARD } from '../src/main/theory/sandbox.ts'
import { findOnPath } from '../src/main/detect.ts'

test('검산 코드 정적 검사 — 계산용 import 만, 위험한 이름은 막고 글자 안 낱말은 괜찮다', () => {
  assert.equal(pyRisk('import json\nfrom collections import deque\nimport heapq, math\nprint(1)'), null)
  assert.match(pyRisk('import os\nprint(1)')!, /허용하지 않는 import: os/)
  assert.match(pyRisk('from subprocess import run')!, /subprocess/)
  assert.match(pyRisk('x = open("a")')!, /open/)
  assert.match(pyRisk('__import__("os")')!, /__import__/)
  assert.match(pyRisk('getattr(x, "y")')!, /getattr/)
  assert.equal(pyRisk('print("open the window")'), null) // 글자 안의 낱말
  assert.match(pyRisk('x' + ' '.repeat(3001))!, /너무 깁니다/)
})

test('검산 코드 격리 실행 — 줄 출력 · 쓰기 막힘 · 시간 제한', { skip: !canSandbox() }, async () => {
  const ok = await runPy('import json\nfor i in range(3):\n    print(json.dumps({"at": i}))\n')
  assert.deepEqual(ok, { ok: true, lines: ['{"at": 0}', '{"at": 1}', '{"at": 2}'] })
  const loop = await runPy('while True:\n    pass\n', { timeoutMs: 800 })
  assert.equal(loop.ok, false)
  const err = await runPy('print(1/0)')
  assert.ok(!err.ok && /ZeroDivisionError/.test(err.error))
  const blocked = await runPy('import os')
  assert.ok(!blocked.ok && /import: os/.test(blocked.error))
})

test('앞머리 show() 에 손대지 못한다 — 밑줄 두 개 이름 · _getframe 은 막는다', () => {
  assert.match(pyRisk('print(show.__defaults__)')!, /__defaults__/)
  assert.match(pyRisk('f = sys_frame = _getframe')!, /_getframe/)
  assert.equal(pyRisk('s = "__x__"\nshow({"a": 1})'), null) // 글자 안은 괜찮다
})

test('앞머리 show() — 부른 줄 번호(AI 코드 기준)와 상태를 찍는다', { skip: !canSandbox() }, async () => {
  const { PRELUDE } = await import('../src/main/theory/pipeline.ts')
  const r = await runPy('x = 1\nshow({"x": x})\nx += 1\nshow({"x": x})', { prelude: PRELUDE })
  assert.ok(r.ok)
  assert.deepEqual(r.lines.map(l => JSON.parse(l)), [{ _line: 2, state: { x: 1 } }, { _line: 4, state: { x: 2 } }])
})

test('정적 검사 우회 — 프레임 속성 · f-string 안 식 · format 으로 꺼내기를 막는다', () => {
  assert.match(pyRisk('g = (x for x in [1])\nb = g.gi_frame.f_builtins\nb["op" + "en"]("/etc/hosts")')!, /gi_frame/)
  assert.match(pyRisk('print(f"{show.__globals__}")')!, /__globals__/) // f-string 은 글자 안도 본다
  assert.match(pyRisk('x = 1\nprint(f"{x}")\ns = "open"')!, /open/) // f-string 이 있으면 글자 안 낱말도 걸린다(보수적으로)
  assert.match(pyRisk('print("{0.__globals__}".format(show))')!, /format/)
  assert.match(pyRisk('import collections\nm = collections._sys.modules')!, /\._sys/)
  assert.match(pyRisk('from collections import _sys')!, /_sys/)
  assert.equal(pyRisk('for _ in range(3):\n    x = 1'), null) // 버리는 변수 _ 는 괜찮다
  assert.equal(pyRisk('s = "open the door"\nshow({"a": s})'), null) // 보통 글자 안 낱말은 괜찮다
})

test('샌드박스 규칙 — 홈 폴더는 읽지 못하고, Python 이 홈 아래 있으면 그 폴더만 허용', async () => {
  const { sandboxProfile } = await import('../src/main/theory/sandbox.ts')
  const p = sandboxProfile('/tmp/x', '/Users/me', '/opt/homebrew/opt/python')
  assert.match(p, /\(deny file-read\* \(subpath "\/Users\/me"\)\)/)
  assert.doesNotMatch(p, /allow file-read/)
  assert.match(sandboxProfile('/tmp/x', '/Users/me', '/Users/me/.pyenv/versions/3.12'), /\(allow file-read\* \(subpath "\/Users\/me\/.pyenv\/versions\/3.12"\)\)$/)
  assert.doesNotMatch(sandboxProfile('/tmp/x', '/Users/me', '/Users/meow/py'), /allow file-read/) // 이름만 비슷한 폴더는 아니다
})

test('실제 격리 — 정적 검사를 지나도 홈 폴더 파일은 읽히지 않는다', { skip: !canSandbox() }, async () => {
  const { homedir } = await import('node:os')
  const { writeFile, rm, mkdtemp } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const dir = await mkdtemp(join(homedir(), '.inkline-sbx-')), f = join(dir, 'secret.txt')
  await writeFile(f, 'secret')
  try {
    // open 은 정적 검사가 막으니, 검사를 거치지 않는 앞머리(prelude)로 직접 읽어 본다 — 격리 층만 시험
    const r = await runPy('show({})', { prelude: `try:\n    print(open(${JSON.stringify(f)}).read())\nexcept Exception as e:\n    print("막힘", type(e).__name__)\ndef show(s): pass` })
    assert.ok(r.ok)
    assert.deepEqual(r.lines, ['막힘 PermissionError'])
  } finally { await rm(dir, { recursive: true, force: true }) }
})

// Windows 의 격리(감사 훅)는 맥 Python 으로도 같은 코드가 돈다 — 정적 검사를 지난 척하고 훅만 시험한다
test('Windows 격리 — 감사 훅이 파일 · 새 import · os 동작을 막고 계산은 그대로 된다', { skip: !findOnPath('python3', process.env.PATH ?? '') }, () => {
  const py = (code: string) => spawnSync('python3', ['-I', '-S', '-B', '-X', 'utf8', '-c', `${PY_GUARD}\nimport json\n${code}`], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } })
  const ok = py('import heapq\nh=[3,1,2]; heapq.heapify(h); print(json.dumps({"한글": h[0]}, ensure_ascii=False))')
  assert.equal(ok.stdout.trim(), '{"한글": 1}')
  for (const bad of ['open("/etc/hosts").read()', 'import socket', 'import os; os.system("echo x")', 'import os; os.listdir(".")', 'import os; os.open("/etc/hosts", 0)', 'import os; os.remove("x")']) {
    const r = py(bad)
    assert.notEqual(r.status, 0, bad)
    assert.match(r.stderr, /PermissionError: 막힌 동작/, bad)
  }
})
