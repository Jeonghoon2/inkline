import { Database, FileText, Globe, PenLine, Scale, Scissors, SearchCheck, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react'
import type { ResumeStageId } from '../../shared/types.ts'
import { t } from '../../shared/i18n.ts'
import { StageFlow, type FlowState, type StageNode } from '../shell/StageFlow.tsx'
export type { FlowState }

// 최신화 · 점검 진행 — 모듈 상태는 main 이 보낸 것(resume:stage)만 따른다. 지금 모듈은 점이 숨 쉬고 경과 시간을, 끝난 모듈은 결과 한 줄을 보인다
const NODE: Record<ResumeStageId, StageNode> = {
  read: { icon: FileText, title: '이력서', sub: '가이드 · 채용 근거', ai: false }, // i18n-ok — 쓰는 곳에서 t()
  records: { icon: Database, title: '작업 기록', sub: '모으는 중', ai: false }, // i18n-ok
  research: { icon: Globe, title: '직무 자료', sub: '이력서 · 자소서 자료 수집', ai: true }, // i18n-ok
  judge: { icon: Scale, title: '기록 판정', sub: '새 기록마다 넣을지', ai: true }, // i18n-ok
  write: { icon: PenLine, title: '문장 쓰기', sub: '후보만 · 근거 인용', ai: true }, // i18n-ok
  polish: { icon: Sparkles, title: '윤문', sub: 'AI 말투 · 번역투', ai: true }, // i18n-ok
  verify: { icon: SearchCheck, title: '사실 검증', sub: '근거 · 수치 대조', ai: false }, // i18n-ok
  screen: { icon: ShieldCheck, title: '점검', sub: '불리 · 불필요', ai: true }, // i18n-ok
  risk: { icon: ShieldAlert, title: '불리 찾기', sub: '줄마다 판정', ai: true }, // i18n-ok
  extra: { icon: Scissors, title: '불필요 찾기', sub: '줄마다 판정', ai: true }, // i18n-ok
  rewrite: { icon: PenLine, title: '고쳐 쓰기', sub: '걸린 줄만', ai: true }, // i18n-ok
  rules: { icon: SearchCheck, title: '검사', sub: '근거 · 수치 · 불리한 말', ai: false } // i18n-ok
}
// 직무 이력서 최신화는 맨 앞에 직무 자료 수집(없는 직무는 웹에서 모으고, 있으면 그대로 쓴다)
const LAYERS: Record<'update' | 'role' | 'review', ResumeStageId[][]> = {
  update: [['read', 'records'], ['judge'], ['write'], ['polish'], ['verify'], ['screen']],
  role: [['read', 'records'], ['research'], ['judge'], ['write'], ['polish'], ['verify'], ['screen']],
  review: [['read', 'records'], ['risk', 'extra'], ['rewrite'], ['polish'], ['rules']]
}
export function ResumeFlow({ mode, role, flow, now }: { mode: 'update' | 'review'; role: boolean; flow: FlowState; now: number }) {
  const nodes = Object.fromEntries(Object.entries(NODE).map(([k, n]) => [k, { ...n, title: t(n.title), sub: t(n.sub) }]))
  return <StageFlow nodes={nodes} layers={LAYERS[mode === 'update' && role ? 'role' : mode]} flow={flow} now={now} label={mode === 'review' ? t('점검 진행') : t('최신화 진행')} />
}
