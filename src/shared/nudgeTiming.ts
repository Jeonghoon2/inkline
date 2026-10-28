// 넛지를 띄울 때인가: 연 뒤 quietMs 가 지났고, 마지막 활동 뒤 idleMs 가 지났고, 화면이 보일 때
export function nudgeDue(o: { now: number; openedAt: number; lastActivity: number; quietMs: number; idleMs: number; hidden: boolean }): boolean {
  return !o.hidden && o.now >= o.openedAt + o.quietMs && o.now - o.lastActivity >= o.idleMs
}

// 단계 시계에 더할 시간: since 부터 now 까지, 마지막 활동 + idleMs 이후는 뺀다
export function countedMs(o: { since: number; now: number; lastActivity: number; idleMs: number }): number {
  return Math.max(0, Math.min(o.now, o.lastActivity + o.idleMs) - o.since)
}
