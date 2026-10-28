import { House, NotebookPen, FileText, IdCard, Library, CodeXml, MessagesSquare, GraduationCap, Settings, type LucideIcon } from 'lucide-react'
import { t } from '../../shared/i18n.ts'

export type TabId = 'home' | 'history' | 'reports' | 'resume' | 'knowledge' | 'coding' | 'cert' | 'drill' | 'settings'

// 표는 한국어로 두고 그릴 때 t() 로 바꾼다(언어는 앱 시작 후 정해진다)
const TOP: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: '홈', icon: House }, // i18n-ok
  { id: 'history', label: '작업 기록', icon: NotebookPen }, // i18n-ok
  { id: 'reports', label: '주간 보고', icon: FileText }, // i18n-ok
  { id: 'resume', label: '이력서', icon: IdCard }, // i18n-ok
  { id: 'knowledge', label: '지식사전', icon: Library }, // i18n-ok
  { id: 'coding', label: '코테 연습', icon: CodeXml }, // i18n-ok
  { id: 'cert', label: '자격증', icon: GraduationCap }, // i18n-ok
  { id: 'drill', label: '면접 연습', icon: MessagesSquare } // i18n-ok
]

export function Rail({ active, onSelect }: { active: TabId; onSelect: (t: TabId) => void }) {
  const item = (id: TabId, label: string, Icon: LucideIcon) => (
    <button key={id} aria-label={label} data-tip={label} aria-current={active === id ? 'page' : undefined} onClick={() => onSelect(id)}>
      <Icon size={20} strokeWidth={1.8} aria-hidden />
    </button>
  )
  return (
    <nav className="rail drag" aria-label={t('메뉴')}>
      {TOP.map(x => item(x.id, t(x.label), x.icon))}
      <hr />
      <div className="spacer" />
      {item('settings', t('환경설정'), Settings)}
    </nav>
  )
}
