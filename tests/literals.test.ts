import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasUnknown, javaType, cppType, javaExpr, cppExpr } from '../src/main/practice/literals.ts'

test('타입 이름', () => {
  assert.equal(javaType({ array: 'int' }), 'int[]')
  assert.equal(javaType({ array: { array: 'string' } }), 'String[][]')
  assert.equal(javaType({ array: { array: 'int', list: true }, list: true }), 'List<List<Integer>>')
  assert.equal(javaType('bool'), 'boolean')
  assert.equal(cppType({ array: 'long' }), 'vector<long long>')
  assert.equal(cppType('TreeNode'), 'TreeNode*')
  assert.equal(hasUnknown({ array: 'unknown' }), true)
  assert.equal(hasUnknown({ array: 'int' }), false)
})

test('Java 식', () => {
  assert.equal(javaExpr([2, 7, 11], { array: 'int' }), 'new int[]{2, 7, 11}')
  assert.equal(javaExpr([[1], []], { array: { array: 'int' } }), 'new int[][]{new int[]{1}, new int[]{}}')
  assert.equal(javaExpr([1, 2], { array: 'int', list: true }), 'new ArrayList<>(List.of(1, 2))')
  assert.equal(javaExpr(9007199254740993, 'long'), '9007199254740992L')
  assert.equal(javaExpr(3, 'double'), '3.0')
  assert.equal(javaExpr('a"b\\\n', 'string'), '"a\\"b\\\\\\n"')
  assert.equal(javaExpr("'", 'char'), "'\\''")
  assert.equal(javaExpr([1, null, 2], 'TreeNode'), 'TreeNode.of(new Integer[]{1, null, 2})')
  assert.equal(javaExpr([1, 2], 'ListNode'), 'ListNode.of(new int[]{1, 2})')
  assert.throws(() => javaExpr('x', 'int'), /맞지 않습니다/)
})

test('C++ 식', () => {
  assert.equal(cppExpr([2, 7], { array: 'int' }), 'vector<int>{2, 7}')
  assert.equal(cppExpr([['a', 'b']], { array: { array: 'string' } }), 'vector<vector<string>>{vector<string>{string("a"), string("b")}}')
  assert.equal(cppExpr(5, 'long'), '5LL')
  assert.equal(cppExpr(true, 'bool'), 'true')
  assert.equal(cppExpr([1, null, 2], 'TreeNode'), 'mk_tree({"1", "null", "2"})')
  assert.equal(cppExpr([], 'ListNode'), 'mk_list({})')
})

test('리뷰 수정: 큰 실수 · 원시 배열 null · int 범위', () => {
  assert.equal(javaExpr(1e21, 'double'), '1e+21')
  assert.equal(cppExpr(1e21, 'double'), '1e+21')
  assert.equal(javaExpr(-2.5, 'double'), '-2.5')
  assert.throws(() => javaExpr([1, null], { array: 'int' }), /맞지 않습니다/)
  assert.throws(() => javaExpr([null], { array: 'bool', list: true }), /맞지 않습니다/)
  assert.equal(javaExpr(['a', null], { array: 'string' }), 'new String[]{"a", null}')
  assert.throws(() => javaExpr(2 ** 31, 'int'), /맞지 않습니다/)
  assert.throws(() => cppExpr(2 ** 31, 'int'), /맞지 않습니다/)
  assert.throws(() => cppExpr(-(2 ** 31) - 1, 'int'), /맞지 않습니다/)
  assert.equal(javaExpr(-(2 ** 31), 'int'), '-2147483648')
})

test('ListNode · TreeNode 값은 int 범위만', () => {
  assert.throws(() => javaExpr([3000000000], 'ListNode'), /맞지 않습니다/)
  assert.throws(() => cppExpr([1, 2 ** 31], 'TreeNode'), /맞지 않습니다/)
  assert.equal(cppExpr([1, null, -(2 ** 31)], 'TreeNode'), 'mk_tree({"1", "null", "-2147483648"})')
})
