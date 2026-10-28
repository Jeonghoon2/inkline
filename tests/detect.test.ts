import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findOnPath, firstVersion, detectTools, runCapture, cmdShimTarget, resolveCommand } from '../src/main/detect.ts'
import type { ToolInfo } from '../src/shared/types.ts'

function fakeBin(dir: string, name: string, script: string): void {
  const p = join(dir, name)
  writeFileSync(p, `#!/bin/sh\n${script}\n`)
  chmodSync(p, 0o755)
}

test('findOnPath 는 PATH 앞쪽 실행 파일을 찾고 실행 권한 없는 파일은 건너뛴다', () => {
  const a = mkdtempSync(join(tmpdir(), 'a-'))
  const b = mkdtempSync(join(tmpdir(), 'b-'))
  writeFileSync(join(a, 'tool'), 'no exec')
  fakeBin(b, 'tool', 'echo hi')
  assert.equal(findOnPath('tool', `${a}:${b}`), join(b, 'tool'))
  assert.equal(findOnPath('nope', `${a}:${b}`), null)
})

test('firstVersion 은 첫 버전 숫자를 뽑고, 없으면 null', () => {
  assert.equal(firstVersion('2.1.302 (Claude Code)'), '2.1.302')
  assert.equal(firstVersion('codex-cli 0.160.1'), '0.160.1')
  assert.equal(firstVersion('openjdk version "21.0.4" 2024-07-16'), '21.0.4')
  assert.equal(firstVersion('Apple clang version 17.0.0 (clang-1700.0.13.3)'), '17.0.0')
  assert.equal(firstVersion('The operation couldn’t be completed. Unable to locate a Java Runtime.'), null)
})

test('detectTools 는 버전을 읽은 것만 있다고 본다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bin-'))
  fakeBin(dir, 'claude', 'echo "2.1.302 (Claude Code)"')
  fakeBin(dir, 'java', 'echo "Unable to locate a Java Runtime." >&2; exit 1')
  fakeBin(dir, 'javac', 'echo "javac 21.0.4" >&2')
  const t = await detectTools(dir)
  const by = (list: ToolInfo[], id: string) => list.find(x => x.id === id)
  assert.deepEqual(by(t.ai, 'claude'), { id: 'claude', path: join(dir, 'claude'), version: '2.1.302' })
  assert.deepEqual(by(t.ai, 'codex'), { id: 'codex', path: null, version: null })
  assert.equal(by(t.runners, 'java')?.version, null)
  assert.equal(by(t.runners, 'javac')?.version, '21.0.4')
  assert.equal(t.runners.length, 5)
})

test('findOnPath 는 같은 이름의 디렉터리를 건너뛴다', () => {
  const a = mkdtempSync(join(tmpdir(), 'a-'))
  const b = mkdtempSync(join(tmpdir(), 'b-'))
  mkdirSync(join(a, 'tool'))
  fakeBin(b, 'tool', 'echo hi')
  assert.equal(findOnPath('tool', `${a}:${b}`), join(b, 'tool'))
})

test('runCapture 의 stdout 모드는 stderr 를 섞지 않는다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rc-'))
  fakeBin(dir, 'w', 'echo \'{"ok":1}\'; echo warn >&2')
  const file = join(dir, 'w')
  assert.equal(await runCapture(file, [], 5000, 'stdout'), '{"ok":1}\n')
  const both = await runCapture(file, [], 5000, 'both')
  assert.ok(both.includes('{"ok":1}') && both.includes('warn'), both)
})

// Windows 갈래는 플랫폼을 인자로 받아 맥에서도 시험한다 (경로는 맥 모양, 구분자 · 확장자 규칙만 Windows)
const SHIM = `@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n  SET PATHEXT=%PATHEXT:;.JS;=;%\r\n)\r\n\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n`
const OLD_SHIM = `@IF EXIST "%~dp0\\node.exe" (\r\n  "%~dp0\\node.exe"  "%~dp0\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*\r\n) ELSE (\r\n  @SETLOCAL\r\n  node  "%~dp0\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*\r\n)\r\n`

test('Windows: findOnPath 는 PATHEXT 순서(.EXE 가 .CMD 보다 먼저)로 찾고 확장자 없는 sh 껍데기는 건너뛴다', () => {
  const a = mkdtempSync(join(tmpdir(), 'wa-')), b = mkdtempSync(join(tmpdir(), 'wb-'))
  fakeBin(a, 'claude', 'echo sh')
  fakeBin(a, 'claude.cmd', '')
  fakeBin(b, 'node.exe', '')
  fakeBin(b, 'node.cmd', '')
  const lc = (p: string | null) => p?.toLowerCase() // Windows(와 맥) 파일 시스템은 대소문자를 가리지 않아 PATHEXT 의 .CMD 그대로 돌아온다
  assert.equal(lc(findOnPath('claude', `${a};${b}`, true)), join(a, 'claude.cmd').toLowerCase())
  assert.equal(lc(findOnPath('node', `${a};${b}`, true)), join(b, 'node.exe').toLowerCase())
})

test('Windows: npm 의 .cmd 껍데기는 node 로 그 js 를 직접 돌린다 (cmd.exe 를 거치지 않는다)', () => {
  assert.equal(cmdShimTarget(SHIM, 'C:\\npm\\codex.cmd'), 'C:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js')
  assert.equal(cmdShimTarget(OLD_SHIM, 'C:\\npm\\claude.cmd'), 'C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js')
  assert.equal(cmdShimTarget('@echo off\r\necho hi\r\n', 'C:\\x.cmd'), null)
  const a = mkdtempSync(join(tmpdir(), 'wc-'))
  writeFileSync(join(a, 'codex.cmd'), SHIM); chmodSync(join(a, 'codex.cmd'), 0o755)
  fakeBin(a, 'node.exe', '')
  fakeBin(a, 'python.exe', '')
  const prompt = '줄\n바꿈과 "따옴표"'
  const [cmd, args] = resolveCommand('codex', ['exec', prompt], a, true)
  assert.equal(cmd.toLowerCase(), join(a, 'node.exe').toLowerCase())
  assert.ok(args[0]!.endsWith('node_modules\\@openai\\codex\\bin\\codex.js'))
  assert.deepEqual(args.slice(1), ['exec', prompt]) // 인자는 손대지 않는다
  const [pcmd, pargs] = resolveCommand('python', ['main.py'], a, true)
  assert.equal(pcmd.toLowerCase(), join(a, 'python.exe').toLowerCase()); assert.deepEqual(pargs, ['main.py'])
  assert.deepEqual(resolveCommand('./main.exe', ['0'], a, true), ['./main.exe', ['0']])
  assert.deepEqual(resolveCommand('codex', ['x'], a, false), ['codex', ['x']]) // 맥은 그대로
})
