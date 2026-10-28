import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildHarness, supportReason } from '../src/main/practice/harness.ts'
import type { Lang, Problem } from '../src/shared/types.ts'

const has = (c: string) => { try { execFileSync('/bin/sh', ['-c', `command -v ${c}`]); return true } catch { return false } }
type P = Pick<Problem, 'site' | 'signature' | 'examples'>

// 테스트 안에서만 쓰는 작은 실행기 (앱의 코드 실행기와 다르다)
function run(lang: Lang, p: P, code: string, i: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'h-'))
  try {
    const h = buildHarness(lang, p, code)
    for (const [n, s] of Object.entries(h.files)) writeFileSync(join(dir, n), s)
    if (h.compile) execFileSync(h.compile[0], h.compile.slice(1), { cwd: dir })
    const [cmd, ...args] = h.run(i)
    let out = ''
    try { out = execFileSync(cmd, args, { cwd: dir, encoding: 'utf8' }) } catch (e) { out = (e as { stdout: string }).stdout }
    return out.split('\n').find(l => l.startsWith('__INKLINE')) ?? ''
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const queue: P = {
  site: 'programmers',
  signature: { name: 'solution', params: [{ name: 'q1', type: { array: 'int' } }, { name: 'q2', type: { array: 'int' } }], returns: 'int' },
  examples: [{ args: [[3, 2, 7, 2], [4, 6, 5, 1]], expected: 2 }]
}
const SUM_CODE: Record<Lang, string> = {
  python3: 'def solution(q1, q2):\n    print("debug")\n    return sum(q1) - sum(q2) + 4',
  javascript: 'function solution(q1, q2) { console.log("debug"); return q1.reduce((a,b)=>a+b,0) - q2.reduce((a,b)=>a+b,0) + 4 }',
  java: 'import java.util.Arrays;\nclass Solution {\n  public int solution(int[] q1, int[] q2) { System.out.println("debug"); return Arrays.stream(q1).sum() - Arrays.stream(q2).sum() + 4; }\n}',
  cpp: '#include <numeric>\nint solution(vector<int> q1, vector<int> q2) { cout << "debug"; return accumulate(q1.begin(), q1.end(), 0) - accumulate(q2.begin(), q2.end(), 0) + 4; }'
}
const RUNTIME: Record<Lang, string> = { python3: 'python3', javascript: 'node', java: 'javac', cpp: 'g++' }

for (const lang of ['python3', 'javascript', 'java', 'cpp'] as Lang[]) {
  test(`${lang}: Programmers 전역 함수 · 사용자 출력과 결과 줄 분리`, { skip: !has(RUNTIME[lang]) }, () => {
    assert.equal(run(lang, queue, SUM_CODE[lang], 0), '__INKLINE__2')
  })
}

const twoSum: P = {
  site: 'leetcode',
  signature: { name: 'twoSum', params: [{ name: 'nums', type: { array: 'int' } }, { name: 'target', type: 'int' }], returns: { array: 'int' } },
  examples: [{ args: [[2, 7, 11, 15], 9], expected: [0, 1] }]
}
const TWO: Record<Lang, string> = {
  python3: 'class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        d = {}\n        for i, x in enumerate(nums):\n            if target - x in d: return [d[target - x], i]\n            d[x] = i',
  javascript: 'var twoSum = function(nums, target) { const d = new Map(); for (let i = 0; i < nums.length; i++) { if (d.has(target - nums[i])) return [d.get(target - nums[i]), i]; d.set(nums[i], i) } };',
  java: 'class Solution {\n  public int[] twoSum(int[] nums, int target) {\n    Map<Integer,Integer> d = new HashMap<>();\n    for (int i = 0; i < nums.length; i++) { if (d.containsKey(target - nums[i])) return new int[]{d.get(target - nums[i]), i}; d.put(nums[i], i); }\n    return new int[0];\n  }\n}',
  cpp: 'class Solution {\npublic:\n  vector<int> twoSum(vector<int>& nums, int target) {\n    unordered_map<int,int> d;\n    for (int i = 0; i < (int)nums.size(); i++) { if (d.count(target - nums[i])) return {d[target - nums[i]], i}; d[nums[i]] = i; }\n    return {};\n  }\n};'
}
for (const lang of ['python3', 'javascript', 'java', 'cpp'] as Lang[]) {
  test(`${lang}: LeetCode Solution 메서드 · 배열 결과`, { skip: !has(RUNTIME[lang]) }, () => {
    assert.equal(run(lang, twoSum, TWO[lang], 0), '__INKLINE__[0,1]')
  })
}

const reverseList: P = {
  site: 'leetcode',
  signature: { name: 'reverseList', params: [{ name: 'head', type: 'ListNode' }], returns: 'ListNode' },
  examples: [{ args: [[1, 2, 3]], expected: [3, 2, 1] }]
}
const REV: Record<Lang, string> = {
  python3: 'class Solution:\n    def reverseList(self, head):\n        prev = None\n        while head:\n            head.next, prev, head = prev, head, head.next\n        return prev',
  javascript: 'var reverseList = function(head) { let p = null; while (head) { const n = head.next; head.next = p; p = head; head = n } return p };',
  java: 'class Solution {\n  public ListNode reverseList(ListNode head) { ListNode p = null; while (head != null) { ListNode n = head.next; head.next = p; p = head; head = n; } return p; }\n}',
  cpp: 'class Solution {\npublic:\n  ListNode* reverseList(ListNode* head) { ListNode* p = nullptr; while (head) { auto n = head->next; head->next = p; p = head; head = n; } return p; }\n};'
}
for (const lang of ['python3', 'javascript', 'java', 'cpp'] as Lang[]) {
  test(`${lang}: ListNode 인자 · 결과`, { skip: !has(RUNTIME[lang]) }, () => {
    assert.equal(run(lang, reverseList, REV[lang], 0), '__INKLINE__[3,2,1]')
  })
}

const rotate: P = {
  site: 'leetcode',
  signature: { name: 'rotate', params: [{ name: 'nums', type: { array: 'int' } }, { name: 'k', type: 'int' }], returns: 'unknown', outParam: 0 },
  examples: [{ args: [[1, 2, 3, 4, 5], 2], expected: [4, 5, 1, 2, 3] }]
}
test('python3: void + outParam 은 실행 뒤 그 인자를 결과로', { skip: !has('python3') }, () => {
  const code = 'class Solution:\n    def rotate(self, nums, k):\n        k %= len(nums)\n        nums[:] = nums[-k:] + nums[:-k]'
  assert.equal(run('python3', rotate, code, 0), '__INKLINE__[4,5,1,2,3]')
})
test('java: void + outParam', { skip: !has('javac') }, () => {
  const code = 'class Solution {\n  public void rotate(int[] nums, int k) { int n = nums.length; k %= n; int[] c = nums.clone(); for (int i = 0; i < n; i++) nums[(i + k) % n] = c[i]; }\n}'
  assert.equal(run('java', rotate, code, 0), '__INKLINE__[4,5,1,2,3]')
})

test('예외는 __INKLINE_ERR__', { skip: !has('python3') }, () => {
  assert.match(run('python3', queue, 'def solution(q1, q2):\n    raise ValueError("나빠")', 0), /^__INKLINE_ERR__.*나빠/)
})

test('Java List<List<Integer>> 인자', { skip: !has('javac') }, () => {
  const tri: P = {
    site: 'leetcode',
    signature: { name: 'minimumTotal', params: [{ name: 't', type: { array: { array: 'int', list: true }, list: true } }], returns: 'int' },
    examples: [{ args: [[[2], [3, 4]]], expected: 5 }]
  }
  const code = 'class Solution {\n  public int minimumTotal(List<List<Integer>> t) { return t.get(0).get(0) + Math.min(t.get(1).get(0), t.get(1).get(1)); }\n}'
  assert.equal(run('java', tri, code, 0), '__INKLINE__5')
})

test('지원 여부', () => {
  assert.equal(supportReason(queue, 'python3'), null)
  assert.match(supportReason({ ...queue, signature: null }, 'java')!, /함수 모양/)
  assert.match(supportReason({ ...queue, examples: [] }, 'java')!, /예제/)
  assert.match(supportReason({ ...queue, signature: { ...queue.signature!, returns: 'unknown' } }, 'java')!, /타입/)
  assert.match(supportReason({ ...queue, examples: [{ args: [[1], [2]], expected: '2, nums = [_,_]' }] }, 'java')!, /결과/)
  assert.equal(supportReason(rotate, 'python3'), null)
})

// ── 브리프 밖 추가 확인: TreeNode · 문자열 이스케이프 · 남은 언어의 outParam · 예외 ──
const LANGS4 = ['python3', 'javascript', 'java', 'cpp'] as Lang[]
const invert: P = {
  site: 'leetcode',
  signature: { name: 'invertTree', params: [{ name: 'root', type: 'TreeNode' }], returns: 'TreeNode' },
  examples: [{ args: [[4, 2, 7, 1, null, 6, 9]], expected: [4, 7, 2, 9, 6, null, 1] }, { args: [[]], expected: [] }]
}
const INV: Record<Lang, string> = {
  python3: 'class Solution:\n    def invertTree(self, root: Optional[TreeNode]) -> Optional[TreeNode]:\n        if root: root.left, root.right = self.invertTree(root.right), self.invertTree(root.left)\n        return root',
  javascript: 'var invertTree = function(root) { if (root) { const l = root.left; root.left = invertTree(root.right); root.right = invertTree(l) } return root };',
  java: 'class Solution {\n  public TreeNode invertTree(TreeNode root) { if (root != null) { TreeNode l = root.left; root.left = invertTree(root.right); root.right = invertTree(l); } return root; }\n}',
  cpp: 'class Solution {\npublic:\n  TreeNode* invertTree(TreeNode* root) { if (root) { auto l = root->left; root->left = invertTree(root->right); root->right = invertTree(l); } return root; }\n};'
}
const echo: P = {
  site: 'programmers',
  signature: { name: 'solution', params: [{ name: 's', type: 'string' }, { name: 'd', type: 'double' }], returns: { array: 'string' } },
  examples: [{ args: ['가"\\\n', 1.5], expected: [] }]
}
const ECHO: Record<Lang, string> = {
  python3: 'def solution(s, d):\n    return [s, str(d)]',
  javascript: 'function solution(s, d) { return [s, String(d)] }',
  java: 'class Solution {\n  public String[] solution(String s, double d) { return new String[]{s, String.valueOf(d)}; }\n}',
  cpp: 'vector<string> solution(string s, double d) { return {s, to_string(d).substr(0, 3)}; }'
}
const BOOM: Record<Lang, string> = {
  python3: 'def solution(q1, q2):\n    raise ValueError("나빠")',
  javascript: 'function solution(q1, q2) { throw new Error("나빠") }',
  java: 'class Solution {\n  public int solution(int[] q1, int[] q2) { throw new RuntimeException("나빠"); }\n}',
  cpp: '#include <stdexcept>\nint solution(vector<int> q1, vector<int> q2) { throw runtime_error("나빠"); }'
}
const ROT: Record<Lang, string> = {
  python3: '', java: '',
  javascript: 'var rotate = function(nums, k) { k %= nums.length; nums.unshift(...nums.splice(nums.length - k)) };',
  cpp: 'class Solution {\npublic:\n  void rotate(vector<int>& nums, int k) { k %= nums.size(); std::rotate(nums.begin(), nums.end() - k, nums.end()); }\n};'
}
for (const lang of LANGS4) {
  test(`${lang}: TreeNode 인자 · 결과(끝 null 제거) · 빈 트리`, { skip: !has(RUNTIME[lang]) }, () => {
    assert.equal(run(lang, invert, INV[lang], 0), '__INKLINE__[4,7,2,9,6,null,1]')
    assert.equal(run(lang, invert, INV[lang], 1), '__INKLINE__[]')
  })
  test(`${lang}: 문자열 · 실수 인자와 문자열 배열 결과`, { skip: !has(RUNTIME[lang]) }, () => {
    const line = run(lang, echo, ECHO[lang], 0)
    assert.ok(line.startsWith('__INKLINE__'), line)
    assert.deepEqual(JSON.parse(line.slice('__INKLINE__'.length)), ['가"\\\n', '1.5'])
  })
  test(`${lang}: 예외는 __INKLINE_ERR__ 한 줄`, { skip: !has(RUNTIME[lang]) }, () => {
    assert.match(run(lang, queue, BOOM[lang], 0), /^__INKLINE_ERR__.*나빠/)
  })
  if (ROT[lang]) test(`${lang}: void + outParam`, { skip: !has(RUNTIME[lang]) }, () => {
    assert.equal(run(lang, rotate, ROT[lang], 0), '__INKLINE__[4,5,1,2,3]')
  })
}

test('지원 여부: 인자 개수 · 언어별 값 검사', () => {
  assert.match(supportReason({ ...queue, examples: [{ args: [[1]], expected: 1 }] }, 'python3')!, /함수 모양과/)
  assert.match(supportReason({ ...queue, examples: [{ args: [[1, null], [2]], expected: 1 }] }, 'java')!, /맞지 않습니다/)
  assert.equal(supportReason({ ...queue, examples: [{ args: [[1, null], [2]], expected: 1 }] }, 'python3'), null)
})

test('Java: 사용자 import 를 맨 위로, public class Solution 도 된다', { skip: !has('javac') }, () => {
  const h = buildHarness('java', queue, SUM_CODE.java.replace('class Solution', 'public class Solution'))
  assert.match(h.files['Main.java'], /^import java\.util\.Arrays;/m)
  assert.ok(h.files['Main.java'].indexOf('import java.util.Arrays;') < h.files['Main.java'].indexOf('class Solution'))
  assert.equal(run('java', queue, SUM_CODE.java.replace('class Solution', 'public class Solution'), 0), '__INKLINE__2')
})


test('C++: #include <bits/stdc++.h> 로 시작하는 코드도 돈다(macOS clang 에는 없다)', { skip: !has('g++') }, () => {
  const code = '#include <bits/stdc++.h>\nusing namespace std;\n\nint solution(vector<int> q1, vector<int> q2) { printf("x"); return accumulate(q1.begin(), q1.end(), 0) - accumulate(q2.begin(), q2.end(), 0) + 4; }'
  assert.equal(run('cpp', queue, code, 0), '__INKLINE__2')
})

test('Python: inf · nan 결과는 null', { skip: !has('python3') }, () => {
  const p: P = { site: 'programmers', signature: { name: 'solution', params: [], returns: { array: 'double' } }, examples: [{ args: [], expected: [] }] }
  assert.equal(run('python3', p, 'def solution():\n    return [float("inf"), float("nan"), 1.5]', 0), '__INKLINE__[null,null,1.5]')
  assert.equal(run('python3', { ...p, signature: { ...p.signature!, returns: 'double' } }, 'def solution():\n    return float("-inf")', 0), '__INKLINE__null')
})

for (const lang of ['python3', 'javascript'] as Lang[]) {
  test(`${lang}: 예제 값이 잘못돼 인자 변환이 실패해도 __INKLINE_ERR__`, { skip: !has(RUNTIME[lang]) }, () => {
    const bad: P = { ...reverseList, examples: [{ args: [5], expected: [] }] }
    assert.match(run(lang, bad, REV[lang], 0), /^__INKLINE_ERR__/)
  })
}

test('Python: from __future__ import 는 파일 맨 위로', { skip: !has('python3') }, () => {
  const code = 'from __future__ import annotations\n\nclass Solution:\n    def twoSum(self, nums: list[int], target: int) -> list[int]:\n        return [0, 1]'
  assert.match(buildHarness('python3', twoSum, code).files['main.py'], /^from __future__ import annotations\n/)
  assert.equal(run('python3', twoSum, code, 0), '__INKLINE__[0,1]')
})

test('지원 여부: 2^53 넘는 정수는 정확히 다룰 수 없다', () => {
  const big: P = { ...queue, signature: { ...queue.signature!, params: [{ name: 'a', type: 'long' }], returns: 'long' } }
  assert.match(supportReason({ ...big, examples: [{ args: [2 ** 53], expected: 1 }] }, 'python3')!, /큰 수/)
  assert.match(supportReason({ ...big, examples: [{ args: [1], expected: [1, 2 ** 60] }] }, 'cpp')!, /큰 수/)
  assert.equal(supportReason({ ...big, examples: [{ args: [2 ** 53 - 1], expected: 1 }] }, 'java'), null)
})

test('C++: #define int long long 코드도 돈다', { skip: !has('g++') }, () => {
  const one: P = { site: 'programmers', signature: { name: 'solution', params: [{ name: 'a', type: 'int' }], returns: 'int' }, examples: [{ args: [7], expected: 7 }] }
  assert.equal(run('cpp', one, '#define int long long\nint solution(int a) { return a; }', 0), '__INKLINE__7')
})

test('Python: 깊은 재귀(5000)', { skip: !has('python3') }, () => {
  const p: P = { site: 'programmers', signature: { name: 'solution', params: [{ name: 'n', type: 'int' }], returns: 'int' }, examples: [{ args: [5000], expected: 5000 }] }
  assert.equal(run('python3', p, 'def solution(n):\n    def f(k): return 0 if k == 0 else 1 + f(k - 1)\n    return f(n)', 0), '__INKLINE__5000')
})
