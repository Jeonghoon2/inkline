import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loginPath, mergePath } from '../src/main/env.ts'

test('로그인 셸 PATH 는 기본 디렉터리를 담는다', () => {
  const p = loginPath()
  assert.ok(p.split(':').includes('/usr/bin'), p)
})

test('Windows PATH 합치기 — 새로 읽은 것이 앞, 대소문자 · 끝 \\ 만 다른 폴더는 한 번만', () => {
  assert.equal(mergePath('C:\\Windows;C:\\Users\\홍길동\\AppData\\Local\\Microsoft\\WinGet\\Links;', 'c:\\windows\;C:\\app'),
    'C:\\Windows;C:\\Users\\홍길동\\AppData\\Local\\Microsoft\\WinGet\\Links;C:\\app')
  assert.equal(mergePath('', 'C:\\a;C:\\b'), 'C:\\a;C:\\b') // 설정을 못 읽어도 지금 PATH 는 남는다
})
