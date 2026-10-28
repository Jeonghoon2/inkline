// 운영체제 갈래 시험 — node --test platform.test.mjs (맥에서 Windows 쪽을 가짜 파일·환경으로 본다)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromePath, missingTools, sapiRate, speechCmd, which, whisperPython } from './platform.mjs'

const files = map => ({ exists: f => f in map, read: f => map[f] })
// npm cmd-shim(claude.cmd)이 만드는 그대로
const SHIM = `@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n  SET PATHEXT=%PATHEXT:;.JS;=;%\r\n)\r\n\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*\r\n`
// Node 설치본에 딸린 npm.cmd
const NPM = `@ECHO OFF\r\nSETLOCAL\r\nSET "NODE_EXE=%~dp0\\node.exe"\r\nIF NOT EXIST "%NODE_EXE%" (\r\n  SET "NODE_EXE=node"\r\n)\r\nSET "NPM_PREFIX_JS=%~dp0\\node_modules\\npm\\bin\\npm-prefix.js"\r\nSET "NPM_CLI_JS=%~dp0\\node_modules\\npm\\bin\\npm-cli.js"\r\nFOR /F "delims=" %%F IN ('CALL "%NODE_EXE%" "%NPM_PREFIX_JS%"') DO (\r\n  SET "NPM_PREFIX_NPM_CLI_JS=%%F\\node_modules\\npm\\bin\\npm-cli.js"\r\n)\r\n"%NODE_EXE%" "%NPM_CLI_JS%" %*\r\n`
const W = { platform: 'win32', node: 'C:\\node\\node.exe' }

test('맥은 이름·경로를 예전 그대로 돌려준다', () => {
  assert.deepEqual(which('claude', { platform: 'darwin' }), ['claude', []])
  assert.equal(chromePath({ platform: 'darwin' }), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  assert.equal(whisperPython({ platform: 'darwin', home: '/home/a' }), '/home/a/.cache/concept-shorts/venv/bin/python')
  assert.deepEqual(speechCmd('안녕 "하세요"', '/t/0.aiff', { voice: 'Yuna', rate: '185', platform: 'darwin' }), { cmd: 'say', args: ['-v', 'Yuna', '-r', '185', '-o', '/t/0.aiff', '안녕 "하세요"'] })
})

test('Windows: .exe 가 먼저, npm .cmd 는 안의 js 를 node 로', () => {
  const env = { Path: 'C:\\a;C:\\npm' }
  assert.deepEqual(which('claude', { ...W, env, ...files({ 'C:\\a\\claude.exe': '' }) }), ['C:\\a\\claude.exe', []])
  assert.deepEqual(which('claude', { ...W, env, ...files({ 'C:\\npm\\claude.cmd': SHIM }) }), ['C:\\node\\node.exe', ['C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js']])
  assert.deepEqual(which('npm', { ...W, env: { PATH: 'C:\\node' }, ...files({ 'C:\\node\\npm.cmd': NPM }) }), ['C:\\node\\node.exe', ['C:\\node\\node_modules\\npm\\bin\\npm-cli.js']])
  // 예전 cmd-shim("%~dp0\...")과 .bin 의 상대 경로
  const old = '@"%~dp0\\..\\hyperframes\\bin\\hyperframes.mjs" %*'
  assert.deepEqual(which('hyperframes', { ...W, env: { PATH: 'E:\\eng\\node_modules\\.bin' }, ...files({ 'E:\\eng\\node_modules\\.bin\\hyperframes.cmd': old }) }), ['C:\\node\\node.exe', ['E:\\eng\\node_modules\\hyperframes\\bin\\hyperframes.mjs']])
  assert.deepEqual(which('ffmpeg', { ...W, env, ...files({}) }), ['ffmpeg', []])
})

test('Windows: Chrome 은 있는 곳, python 은 Scripts', () => {
  const env = { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' }
  assert.equal(chromePath({ platform: 'win32', env, exists: f => f.startsWith('C:\\Users') }), 'C:\\Users\\a\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
  assert.equal(chromePath({ platform: 'win32', env, exists: () => false }), null)
  assert.equal(whisperPython({ platform: 'win32', home: 'C:\\Users\\a' }), 'C:\\Users\\a\\.cache\\concept-shorts\\venv\\Scripts\\python.exe')
})

test('Windows 음성: 글은 명령줄이 아니라 환경 변수로, 속도는 SAPI 눈금으로', () => {
  const text = '줄\n바꿈과 "따옴표" & %PATH%'
  const s = speechCmd(text, 'C:\\t\\0.wav', { voice: 'Microsoft Heami', rate: '185', platform: 'win32' })
  assert.equal(s.cmd, 'powershell')
  assert.ok(!s.args.some(a => a.includes('따옴표')))
  const script = Buffer.from(s.args.at(-1), 'base64').toString('utf16le')
  assert.match(script, /SpeechSynthesizer/)
  assert.deepEqual(s.env, { SHORTS_TTS_TEXT: text, SHORTS_TTS_OUT: 'C:\\t\\0.wav', SHORTS_TTS_VOICE: 'Microsoft Heami', SHORTS_TTS_RATE: '1' })
  assert.equal(speechCmd('a', 'o.wav', { voice: 'v', rate: '185', sapi: '-2', platform: 'win32' }).env.SHORTS_TTS_RATE, '-2')
  assert.deepEqual([sapiRate(175), sapiRate(185), sapiRate(525), sapiRate(58), sapiRate(9999)], [0, 1, 10, -10, 10])
})

test('ffmpeg · ffprobe 가 PATH 에 없으면 대본을 쓰기 전에 깔 명령을 알려 준다', () => {
  const has = files => f => files.includes(f)
  const win = { platform: 'win32', env: { Path: 'C:\\ff\\bin;C:\\Windows' } }
  assert.equal(missingTools({ ...win, exists: has(['C:\\ff\\bin\\ffmpeg.exe', 'C:\\ff\\bin\\ffprobe.exe']) }), '')
  assert.match(missingTools({ ...win, exists: has(['C:\\ff\\bin\\ffmpeg.exe']) }), /winget install Gyan\.FFmpeg/) // ffprobe 만 빠져도
  assert.match(missingTools({ platform: 'darwin', env: { PATH: '/opt/homebrew/bin' }, exists: has([]) }), /brew install ffmpeg/)
  assert.equal(missingTools({ platform: 'darwin', env: { PATH: '/opt/homebrew/bin' }, exists: has(['/opt/homebrew/bin/ffmpeg', '/opt/homebrew/bin/ffprobe']) }), '')
})
