// 접근 찾기에서 main · renderer 가 같이 쓰는 표 — 시간 복잡도 순위, 개념 key 별칭
export const RANKS = ['O(1)', 'O(log N)', 'O(√N)', 'O(N)', 'O(N log N)', 'O(N^2)', 'O(N^3)', 'O(2^N)', 'O(N!)'] as const
export type Rank = (typeof RANKS)[number]
export const rankIndex = (r: string): number => (RANKS as readonly string[]).indexOf(r)

// 같은 개념을 AI 가 다른 이름으로 쓰면(bfs · breadth-first-search) 이론 장면을 통째로 다시 만든다 — 표준 key 로 모은다
const ALIAS: Record<string, string> = {
  bfs: 'breadth-first-search', dfs: 'depth-first-search', dp: 'dynamic-programming',
  'two-pointer': 'two-pointers', 'sliding-windows': 'sliding-window',
  heap: 'priority-queue', 'min-heap': 'priority-queue', 'max-heap': 'priority-queue', 'binary-heap': 'priority-queue',
  hashmap: 'hash-map', 'hash-table': 'hash-map', dictionary: 'hash-map', 'hash-set': 'hash-map', hashing: 'hash-map',
  'prefix-sums': 'prefix-sum', 'cumulative-sum': 'prefix-sum',
  'disjoint-set': 'union-find', dsu: 'union-find', 'disjoint-set-union': 'union-find',
  bisect: 'binary-search', 'binary-search-on-answer': 'binary-search', 'parametric-search': 'binary-search',
  'topological-ordering': 'topological-sort', toposort: 'topological-sort',
  dijkstra: 'shortest-path', 'dijkstra-algorithm': 'shortest-path', 'bellman-ford': 'shortest-path',
  bitmasking: 'bitmask', 'bit-manipulation': 'bitmask', recursion: 'backtracking',
  'monotonic-stack': 'stack', 'monotone-stack': 'stack', deque: 'deque', 'double-ended-queue': 'deque'
}
// 표준 key → 고정 태그(ai/classify.ts TAGS 중 하나)
const TAG: Record<string, string> = {
  'breadth-first-search': 'BFS', 'depth-first-search': 'DFS', 'dynamic-programming': 'DP', 'two-pointers': '투 포인터',
  'sliding-window': '슬라이딩 윈도우', 'priority-queue': '힙', 'hash-map': '해시', 'prefix-sum': '누적합', 'union-find': '유니온 파인드',
  'binary-search': '이분 탐색', 'topological-sort': '위상 정렬', 'shortest-path': '최단 경로', bitmask: '비트마스크',
  backtracking: '백트래킹', stack: '스택', queue: '큐', deque: '덱', greedy: '그리디', sorting: '정렬', simulation: '시뮬레이션',
  graph: '그래프', tree: '트리', string: '문자열', math: '수학'
}
export function normalizeKey(key: string): string {
  const k = key.trim().toLowerCase()
  return ALIAS[k] ?? k
}
export const tagOfKey = (key: string): string => TAG[normalizeKey(key)] ?? ''
export const approachKey = (keys: string[]): string => [...new Set(keys.map(normalizeKey))].sort().join('+')
export const STANDARD_KEYS = Object.keys(TAG)
