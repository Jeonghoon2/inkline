import type { Lang, Problem, Signature, TypeSpec } from '../../shared/types.ts'
import { javaType, cppType, javaExpr, cppExpr, hasUnknown } from './literals.ts'
import { PY, WIN } from '../env.ts'

type P = Pick<Problem, 'site' | 'signature' | 'examples'>
/** userLineOffset: 만든 파일에서 사용자 코드 앞에 있는 줄 수 (C++ 은 #line 으로 맞추므로 0) */
export interface Harness { files: Record<string, string>; compile: string[] | null; run: (i: number) => string[]; userLineOffset: number }
const lines = (t: string): number => t.split('\n').length - 1

/** 결과로 볼 값의 타입: outParam 이면 그 매개변수, 아니면 반환값 */
const resultType = (s: Signature): TypeSpec | undefined => (s.outParam !== undefined ? s.params[s.outParam]?.type : s.returns)
/** 결과 타입에서 ListNode · TreeNode 가 배열 몇 겹 안에 있는지(없으면 -1). 그 깊이의 null 은 [] 로 찍는다(LeetCode 표기) */
function nodeDepth(t: TypeSpec | undefined, d = 0): number {
  if (typeof t === 'object') return nodeDepth(t.array, d + 1)
  return t === 'ListNode' || t === 'TreeNode' ? d : -1
}

// 2^53 이상 정수는 JSON 을 읽는 순간 값이 바뀐다
const huge = (v: unknown): boolean => (Array.isArray(v) ? v.some(huge) : typeof v === 'number' && Number.isInteger(v) && !Number.isSafeInteger(v))

export function supportReason(p: Pick<Problem, 'signature' | 'examples'>, lang: Lang): string | null {
  const s = p.signature
  if (!s) return '이 문제는 함수 모양을 알 수 없습니다'
  if (!p.examples.length) return '예제를 찾지 못했습니다'
  const rt = resultType(s)
  if (!rt || hasUnknown(rt) || s.params.some((q) => hasUnknown(q.type))) return '지원하지 않는 타입이 있습니다'
  if (p.examples.some((e) => typeof e.expected === 'string') && rt !== 'string' && rt !== 'char') return '예제 결과를 읽지 못했습니다'
  if (p.examples.some((e) => e.args.length !== s.params.length)) return '예제 값이 함수 모양과 맞지 않습니다'
  if (p.examples.some((e) => huge(e.args) || huge(e.expected))) return '정확히 다룰 수 없는 큰 수가 있습니다'
  if (lang === 'java' || lang === 'cpp') {
    const expr = lang === 'java' ? javaExpr : cppExpr
    try { for (const e of p.examples) s.params.forEach((q, k) => expr(e.args[k], q.type)) } catch (e) { return (e as Error).message }
  }
  return null
}

export function buildHarness(lang: Lang, p: P, code: string): Harness {
  if (!p.signature) throw new Error('이 문제는 함수 모양을 알 수 없습니다')
  const h = { python3: pyHarness, javascript: jsHarness, java: javaHarness, cpp: cppHarness }[lang]
  return h(p, p.signature, code)
}

// ── Python ──

const PY_PRE = `import json, sys
sys.setrecursionlimit(10**6)
from typing import *
import collections, heapq, math, bisect, itertools, functools, re, string
from collections import deque, defaultdict, Counter, OrderedDict
from functools import lru_cache, cache, reduce
from heapq import heappush, heappop, heapify
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def _mk_list(a):
    h = None
    for v in reversed(a):
        h = ListNode(v, h)
    return h

def _mk_tree(a):
    if not a or a[0] is None:
        return None
    root = TreeNode(a[0])
    q, k = [root], 1
    for n in q:
        if k >= len(a):
            break
        if a[k] is not None:
            n.left = TreeNode(a[k])
            q.append(n.left)
        k += 1
        if k < len(a) and a[k] is not None:
            n.right = TreeNode(a[k])
            q.append(n.right)
        k += 1
    return root

def _conv(v, t):
    if t == 'ListNode': return _mk_list(v)
    if t == 'TreeNode': return _mk_tree(v)
    if isinstance(t, dict): return [_conv(x, t['array']) for x in v]
    return v

def _out(x, d):
    if x is None:
        return [] if d == 0 else None
    if isinstance(x, ListNode):
        r = []
        while x:
            r.append(x.val)
            x = x.next
        return r
    if isinstance(x, TreeNode):
        r, q = [], [x]
        for n in q:
            r.append(n.val if n else None)
            if n:
                q += [n.left, n.right]
        while r and r[-1] is None:
            r.pop()
        return r
    if isinstance(x, (list, tuple)):
        return [_out(y, d - 1) for y in x]
    if isinstance(x, float) and not math.isfinite(x):
        return None
    return x
`

// from __future__ import 는 파일 맨 처음에 와야 한다
const PY_FUTURE = /^from[ \t]+__future__[ \t]+import[^\n]*$/gm

function pyHarness(p: P, s: Signature, code: string): Harness {
  const future = code.match(PY_FUTURE) ?? []
  code = code.replace(PY_FUTURE, '')
  const lit = (v: unknown) => JSON.stringify(JSON.stringify(v)) // JSON 을 담은 문자열 리터럴 (JS · Python 이스케이프가 같다)
  const call = p.site === 'leetcode' ? `Solution().${s.name}` : s.name
  const main = `
_ARGS = json.loads(${lit(p.examples.map((e) => e.args))})
_TYPES = json.loads(${lit(s.params.map((q) => q.type))})
_i = int(sys.argv[1])
try:
    _args = [_conv(v, t) for v, t in zip(_ARGS[_i], _TYPES)]
    _r = ${call}(*_args)${s.outParam !== undefined ? `\n    _r = _args[${s.outParam}]` : ''}
    _s = json.dumps(_out(_r, ${nodeDepth(resultType(s))}), separators=(',', ':'))
except Exception as e:
    import traceback
    traceback.print_exc()
    print('\\n__INKLINE_ERR__' + (type(e).__name__ + ': ' + str(e)).replace('\\n', ' '), flush=True)
    sys.exit(1)
print('\\n__INKLINE__' + _s, flush=True)
`
  const head = `${future.map((l) => `${l}\n`).join('')}${PY_PRE}\n`
  return { files: { 'main.py': `${head}${code}\n${main}` }, compile: null, run: (i) => [PY, 'main.py', String(i)], userLineOffset: lines(head) }
}

// ── JavaScript (CommonJS) ──

const JS_PRE = `function ListNode(val, next) { this.val = val === undefined ? 0 : val; this.next = next === undefined ? null : next }
function TreeNode(val, left, right) { this.val = val === undefined ? 0 : val; this.left = left === undefined ? null : left; this.right = right === undefined ? null : right }
function __mk_list(a) { let h = null; for (let k = a.length - 1; k >= 0; k--) h = new ListNode(a[k], h); return h }
function __mk_tree(a) {
  if (!a.length || a[0] === null) return null
  const root = new TreeNode(a[0]), q = [root]
  let k = 1
  for (let n = 0; n < q.length && k < a.length; n++) {
    if (a[k] !== null) q.push(q[n].left = new TreeNode(a[k]))
    k++
    if (k < a.length && a[k] !== null) q.push(q[n].right = new TreeNode(a[k]))
    k++
  }
  return root
}
function __conv(v, t) {
  if (t === 'ListNode' || t === 'TreeNode' || typeof t === 'object') { if (!Array.isArray(v)) throw new TypeError('예제 값이 배열이 아닙니다: ' + JSON.stringify(v)) }
  if (t === 'ListNode') return __mk_list(v)
  if (t === 'TreeNode') return __mk_tree(v)
  if (typeof t === 'object') return v.map((x) => __conv(x, t.array))
  return v
}
function __out(x, d) {
  if (x === undefined || x === null) return d === 0 ? [] : null
  if (x instanceof ListNode) { const r = []; for (; x; x = x.next) r.push(x.val); return r }
  if (x instanceof TreeNode) {
    const r = [], q = [x]
    for (let k = 0; k < q.length; k++) { const n = q[k]; r.push(n ? n.val : null); if (n) q.push(n.left, n.right) }
    while (r.length && r[r.length - 1] === null) r.pop()
    return r
  }
  if (Array.isArray(x)) return x.map((y) => __out(y, d - 1))
  return x
}
`

function jsHarness(p: P, s: Signature, code: string): Harness {
  const main = `
const __ARGS = ${JSON.stringify(p.examples.map((e) => e.args))}
const __TYPES = ${JSON.stringify(s.params.map((q) => q.type))}
;(() => {
  let s
  try {
    const args = __ARGS[Number(process.argv[2])].map((v, k) => __conv(v, __TYPES[k]))
    let r = ${s.name}(...args)${s.outParam !== undefined ? `\n    r = args[${s.outParam}]` : ''}
    s = JSON.stringify(__out(r, ${nodeDepth(resultType(s))}))
  } catch (e) {
    console.error(e)
    const msg = e instanceof Error ? e.name + ': ' + e.message : String(e)
    console.log('\\n__INKLINE_ERR__' + msg.replace(/\\n/g, ' '))
    process.exitCode = 1
    return
  }
  console.log('\\n__INKLINE__' + s)
})()
`
  const head = `${JS_PRE}\n`
  return { files: { 'main.js': `${head}${code}\n${main}` }, compile: null, run: (i) => ['node', 'main.js', String(i)], userLineOffset: lines(head) }
}

// ── Java ──

const JAVA_NODES = `
class ListNode {
  int val; ListNode next;
  ListNode() {}
  ListNode(int val) { this.val = val; }
  ListNode(int val, ListNode next) { this.val = val; this.next = next; }
  static ListNode of(int[] a) { ListNode h = null; for (int k = a.length - 1; k >= 0; k--) h = new ListNode(a[k], h); return h; }
}

class TreeNode {
  int val; TreeNode left; TreeNode right;
  TreeNode() {}
  TreeNode(int val) { this.val = val; }
  TreeNode(int val, TreeNode left, TreeNode right) { this.val = val; this.left = left; this.right = right; }
  static TreeNode of(Integer[] a) {
    if (a.length == 0 || a[0] == null) return null;
    TreeNode root = new TreeNode(a[0]);
    java.util.ArrayList<TreeNode> q = new java.util.ArrayList<>(); q.add(root);
    int k = 1;
    for (int n = 0; n < q.size() && k < a.length; n++) {
      if (a[k] != null) { q.get(n).left = new TreeNode(a[k]); q.add(q.get(n).left); }
      k++;
      if (k < a.length && a[k] != null) { q.get(n).right = new TreeNode(a[k]); q.add(q.get(n).right); }
      k++;
    }
    return root;
  }
}
`

const JAVA_MAIN_TAIL = `
  static String q(String s) {
    StringBuilder b = new StringBuilder("\\"");
    for (char c : s.toCharArray()) {
      if (c == '"' || c == '\\\\') b.append('\\\\').append(c);
      else if (c < 0x20 || c > 0x7e) b.append(String.format("\\\\u%04x", (int) c));
      else b.append(c);
    }
    return b.append('"').toString();
  }

  static String j(Object o, int d) {
    if (o == null) return d == 0 ? "[]" : "null";
    if (o instanceof Double || o instanceof Float) { double x = ((Number) o).doubleValue(); return Double.isFinite(x) ? Double.toString(x) : "null"; }
    if (o instanceof Number || o instanceof Boolean) return o.toString();
    if (o instanceof String || o instanceof Character) return q(o.toString());
    java.util.List<Object> l = new java.util.ArrayList<>();
    if (o.getClass().isArray()) { for (int k = 0; k < java.lang.reflect.Array.getLength(o); k++) l.add(java.lang.reflect.Array.get(o, k)); }
    else if (o instanceof Iterable) { for (Object x : (Iterable<?>) o) l.add(x); }
    else if (o instanceof ListNode) { for (ListNode n = (ListNode) o; n != null; n = n.next) l.add(n.val); }
    else if (o instanceof TreeNode) {
      java.util.List<TreeNode> qu = new java.util.ArrayList<>(); qu.add((TreeNode) o);
      for (int k = 0; k < qu.size(); k++) { TreeNode n = qu.get(k); l.add(n == null ? null : n.val); if (n != null) { qu.add(n.left); qu.add(n.right); } }
      while (!l.isEmpty() && l.get(l.size() - 1) == null) l.remove(l.size() - 1);
    }
    else return q(o.toString());
    StringBuilder b = new StringBuilder("[");
    for (int k = 0; k < l.size(); k++) b.append(k > 0 ? "," : "").append(j(l.get(k), d - 1));
    return b.append(']').toString();
  }
}
`

const JAVA_IMPORT = /^[ \t]*import\s+(?:static\s+)?[\w.]+(?:\.\*)?\s*;[ \t]*$/gm
// Main.java 안에서 public 최상위 타입은 Main 하나만 될 수 있다
const JAVA_PUBLIC_TOP = /^public\s+(?=(?:(?:final|abstract)\s+)*(?:class|interface|enum|record)\b)/gm

function javaHarness(p: P, s: Signature, code: string): Harness {
  const imports = ['import java.util.*;', 'import java.util.function.*;', 'import java.util.stream.*;']
  const body = code.replace(JAVA_IMPORT, (m) => { imports.push(m.trim()); return '' }).replace(JAVA_PUBLIC_TOP, '')
  const args = s.params.map((_, k) => `p${k}`).join(', ')
  const call = `new Solution().${s.name}(${args})`
  // 예제마다 메서드 하나 — 메서드 하나의 64KB 바이트코드 한도를 예제끼리 나눠 쓰지 않게
  const cases = p.examples.map((e, i) => {
    const decl = s.params.map((q, k) => `    ${javaType(q.type)} p${k} = ${javaExpr(e.args[k], q.type)};`).join('\n')
    const ret = s.outParam !== undefined ? `    ${call};\n    return p${s.outParam};` : `    return ${call};`
    return `  static Object c${i}() throws Exception {\n${decl}\n${ret}\n  }`
  })
  const main = `
public class Main {
  public static void main(String[] a) {
    int i = Integer.parseInt(a[0]);
    String s;
    try {
      Object r;
      switch (i) {
${p.examples.map((_, i) => `        case ${i}: r = c${i}(); break;`).join('\n')}
        default: throw new IllegalArgumentException("예제 번호 " + i);
      }
      s = j(r, ${nodeDepth(resultType(s))});
    } catch (Throwable e) {
      e.printStackTrace();
      System.out.println("\\n__INKLINE_ERR__" + String.valueOf(e).replace('\\n', ' '));
      System.out.flush();
      System.exit(1);
      return;
    }
    System.out.println("\\n__INKLINE__" + s);
    System.out.flush();
  }

${cases.join('\n\n')}
${JAVA_MAIN_TAIL}`
  const head = `${imports.join('\n')}\n\n`
  return {
    files: { 'Main.java': `${head}${body}\n${JAVA_NODES}${main}` },
    userLineOffset: lines(head),
    compile: ['javac', '-encoding', 'UTF-8', '-d', '.', 'Main.java'],
    // 앱이 LANG 없이 떠도 한글 출력이 깨지지 않게
    run: (i) => ['java', '-Xss64m', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', '-cp', '.', 'Main', String(i)],
  }
}

// ── C++ ──

const CPP_INCLUDES = ['vector', 'string', 'algorithm', 'unordered_map', 'map', 'set', 'unordered_set', 'queue', 'stack', 'deque', 'cmath', 'climits', 'numeric', 'iostream', 'sstream', 'functional', 'utility', 'tuple', 'cstring', 'bitset', 'iomanip', 'optional', 'cstdio', 'cstdlib', 'type_traits', 'list', 'array', 'limits']

const CPP_PRE = `${CPP_INCLUDES.map((h) => `#include <${h}>`).join('\n')}
using namespace std;

struct ListNode {
  int val; ListNode *next;
  ListNode() : val(0), next(nullptr) {}
  ListNode(int x) : val(x), next(nullptr) {}
  ListNode(int x, ListNode *next) : val(x), next(next) {}
};

struct TreeNode {
  int val; TreeNode *left; TreeNode *right;
  TreeNode() : val(0), left(nullptr), right(nullptr) {}
  TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
  TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
};

ListNode* mk_list(vector<int> a) { ListNode* h = nullptr; for (int k = (int)a.size() - 1; k >= 0; k--) h = new ListNode(a[k], h); return h; }

TreeNode* mk_tree(vector<string> a) {
  if (a.empty() || a[0] == "null") return nullptr;
  TreeNode* root = new TreeNode(stoi(a[0]));
  vector<TreeNode*> q{root};
  size_t k = 1;
  for (size_t n = 0; n < q.size() && k < a.size(); n++) {
    if (a[k] != "null") { q[n]->left = new TreeNode(stoi(a[k])); q.push_back(q[n]->left); }
    k++;
    if (k < a.size() && a[k] != "null") { q[n]->right = new TreeNode(stoi(a[k])); q.push_back(q[n]->right); }
    k++;
  }
  return root;
}
`

// 사용자 코드의 전역 j 와 부딪히지 않게 이름에 inkline_ 를 붙인다. 템플릿보다 먼저 선언해야 vector<string> 등에서 찾는다
const CPP_JSON = `
string inkline_j(bool b) { return b ? "true" : "false"; }
string inkline_j(const string& s) {
  string r = "\\"";
  for (unsigned char c : s) {
    if (c == '"' || c == '\\\\') { r += '\\\\'; r += (char)c; }
    else if (c < 0x20) { char u[8]; snprintf(u, sizeof u, "\\\\u%04x", c); r += u; }
    else r += (char)c;
  }
  return r + "\\"";
}
string inkline_j(char c) { return inkline_j(string(1, c)); }
string inkline_j(double d) { if (!isfinite(d)) return "null"; ostringstream o; o << setprecision(17) << d; return o.str(); }
template<class T> typename enable_if<is_integral<T>::value, string>::type inkline_j(T x) { return to_string(x); }
string inkline_j(ListNode* n) { string r = "["; for (bool f = true; n; n = n->next, f = false) r += (f ? "" : ",") + to_string(n->val); return r + "]"; }
string inkline_j(TreeNode* t) {
  vector<TreeNode*> q{t}; vector<string> v;
  for (size_t k = 0; k < q.size(); k++) { if (q[k]) { v.push_back(to_string(q[k]->val)); q.push_back(q[k]->left); q.push_back(q[k]->right); } else v.push_back("null"); }
  while (!v.empty() && v.back() == "null") v.pop_back();
  string r = "["; for (size_t k = 0; k < v.size(); k++) r += (k ? "," : "") + v[k]; return r + "]";
}
template<class T> string inkline_j(const vector<T>& v) {
  string r = "["; bool f = true;
  for (const auto& x : v) { r += f ? "" : ","; f = false; r += inkline_j(x); }
  return r + "]";
}
string inkline_line(string s) { for (auto& c : s) if (c == '\\n') c = ' '; return s; }
`

// macOS clang 에는 bits/stdc++.h 가 없다. 쓸 만한 헤더는 CPP_INCLUDES 가 이미 넣는다
const CPP_BITS = /^[ \t]*#[ \t]*include[ \t]*<bits\/stdc\+\+\.h>.*$/gm

function cppHarness(p: P, s: Signature, code: string): Harness {
  code = code.replace(CPP_BITS, '')
  const call = `${p.site === 'leetcode' ? `Solution().${s.name}` : s.name}(${s.params.map((_, k) => `p${k}`).join(', ')})`
  // 매개변수가 참조(vector<int>&)일 수 있어 인자는 먼저 지역 변수에 담는다
  const cases = p.examples.map((e, i) => {
    const decl = s.params.map((q, k) => `${cppType(q.type)} p${k} = ${cppExpr(e.args[k], q.type)};`).join(' ')
    const res = s.outParam !== undefined ? `${call}; auto& r = p${s.outParam};` : `auto r = ${call};`
    return `      case ${i}: { ${decl} ${res} s = inkline_j(r); break; }`
  })
  const main = `
int main(int argc, char** argv) {
  setvbuf(stdout, nullptr, _IONBF, 0); cout.setf(ios::unitbuf); // 비정상 종료 전에 찍은 출력도 남게
  int i = argc > 1 ? atoi(argv[1]) : 0;
  string s;
  try {
    switch (i) {
${cases.join('\n')}
      default: throw invalid_argument("bad example index");
    }
  } catch (exception& e) {
    cout << "\\n__INKLINE_ERR__" << inkline_line(e.what()) << endl;
    return 1;
  } catch (...) {
    cout << "\\n__INKLINE_ERR__unknown exception" << endl;
    return 1;
  }
  cout << "\\n__INKLINE__" << s << endl;
  return 0;
}
`
  // 오류 줄 번호가 사용자 코드 기준이 되게 #line 으로 파일 이름 · 줄을 바꾼다. 사용자의 #define int 는 여기서 끝낸다
  const head = `${CPP_PRE}\n#line 1 "solution.cpp"\n${code}\n#undef int\n`
  return {
    files: { 'main.cpp': `${head}#line ${lines(head) + 2} "main.cpp"\n${CPP_JSON}${main}` },
    userLineOffset: 0,
    compile: ['g++', '-std=c++17', '-O2', '-o', 'main', 'main.cpp'],
    run: (i) => [WIN ? './main.exe' : './main', String(i)], // Windows 의 g++(MinGW)은 -o main 을 main.exe 로 만든다
  }
}
