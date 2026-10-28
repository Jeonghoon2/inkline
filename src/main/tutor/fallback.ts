import type { Stage } from '../../shared/types.ts'

export const FALLBACK_NUDGE: Record<Stage, string> = {
  understand: '입력 예제 1 을 손으로 따라가며 결과가 어떻게 나오는지 적어 볼까요?',
  plan: '떠올린 방법을 한 줄 주석으로 먼저 적어 볼까요?',
  implement: '지금까지 쓴 코드로 예제 1 을 한 번 실행해 볼까요?',
  debug: '어느 줄에서 값이 예상과 달라지는지 출력해 볼까요?',
  reflect: '이 풀이의 시간 복잡도를 한 줄로 적어 볼까요?'
}

export const FALLBACK_HINT: Record<1 | 2 | 3, string> = {
  1: '제한 사항의 입력 크기로 허용되는 시간 복잡도를 먼저 따져 보세요',
  2: '같은 값을 여러 번 다시 계산하고 있지 않은지 살펴보세요',
  3: '문제의 핵심 연산(찾기 · 넣기 · 빼기)이 몇 번 일어나는지 세어 보세요'
}
