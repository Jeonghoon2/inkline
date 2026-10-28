import { useEffect, useState, type KeyboardEvent } from 'react'
import { RefreshCw } from 'lucide-react'
import { RECORD_RULES, type AiCli, type ModelInfo, type RecordRules, type Settings, type Theme, type ThemeName, type Tools } from '../../shared/types.ts'
import { THEMES } from '../../shared/themes.ts'
import { getLang, t, type UiLangPref } from '../../shared/i18n.ts'
import { Select } from '../shell/Select.tsx'
import { shrinkPhoto as shrink } from '../shell/photo.ts'

const CLI_LABEL: Record<AiCli, string> = { claude: 'Claude Code', gemini: 'Gemini CLI', codex: 'Codex CLI' }
const LANGS: { label: string; need: string[] }[] = [
  { label: 'Python', need: ['python3'] },
  { label: 'JavaScript', need: ['node'] },
  { label: 'Java', need: ['javac', 'java'] },
  { label: 'C++', need: ['g++'] }
]
const CUSTOM = '__custom__'
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

// 입력 중에는 글자만 바꾸고, 칸을 떠나거나 Enter 를 누를 때 값이 맞으면 저장한다
// 정수만. 범위를 벗어나면 끝값으로 맞추고, 숫자가 아니면 되돌리며 그 이유를 옆에 잠깐 보인다
function NumField({ value, min, max, label, onCommit }: { value: number; min: number; max: number; label: string; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  const [note, setNote] = useState('')
  useEffect(() => setDraft(String(value)), [value])
  const commit = (): void => {
    const n = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(n)) { setDraft(String(value)); return setNote(t('숫자를 넣어 주세요')) }
    const k = Math.min(max, Math.max(min, Math.round(n)))
    setNote(k !== n ? t('{min}~{max} 사이 정수로 맞췄습니다', { min, max }) : '')
    setDraft(String(k))
    if (k !== value) onCommit(k)
  }
  return (
    <>
    <input
      aria-label={label}
      className="field num"
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
    {note && <span className="num-note" role="status">{note}</span>}
    </>
  )
}

// 테마 색 견본 — 정사각형을 대각선으로 나눠 [바탕색 / 강조색](tokens.css 의 [data-theme] 묶음을 그대로 쓴다)
const Swatch = ({ id }: { id: string }) => <span className="theme-swatch" data-theme={id} aria-hidden />

export function SettingsTab({ onTheme }: { onTheme: (t: Pick<Settings, 'theme' | 'theme.light' | 'theme.dark'>) => void }) {
  const [s, setS] = useState<Settings | null>(null)
  const [tools, setTools] = useState<Tools | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [custom, setCustom] = useState(false)
  const [pathErr, setPathErr] = useState('')
  const [err, setErr] = useState('')
  const [rules, setRules] = useState<RecordRules | null | undefined>(undefined) // undefined 읽는 중, null 스킬 없음

  const [cats, setCats] = useState<string[]>([]) // 작업 기록 카테고리(프로젝트)
  useEffect(() => {
    void window.api.settings.all().then(setS)
    window.api.history.load().then(h => setCats([...new Set(h.entries.map(e => e.category))].sort()), () => {})
    window.api.history.rules().then(setRules).catch(e => setErr(t('기록 기준을 읽지 못했습니다: {e}', { e: msg(e) })))
    void window.api.tools.detect().then(setTools).catch(e => setErr(t('도구를 탐지하지 못했습니다: {e}', { e: msg(e) })))
  }, [])

  const cli = s?.['ai.cli'] ?? null
  useEffect(() => {
    if (!cli) return setModels([])
    void window.api.tools
      .models(cli)
      .then(list => {
        setModels(list)
        const m = s?.['ai.model'] ?? ''
        setCustom(m !== '' && !list.some(x => x.id === m || x.aliases?.includes(m)))
      })
      .catch(e => setErr(t('모델 목록을 읽지 못했습니다: {e}', { e: msg(e) })))
    // cli 가 바뀔 때만 다시 읽는다
  }, [cli])

  if (!s) return <div />

  const save = <K extends keyof Settings>(key: K, value: Settings[K]): void => {
    setS(prev => (prev ? { ...prev, [key]: value } : prev))
    window.api.settings.set(key, value).catch(e => setErr(t('저장하지 못했습니다: {e}', { e: msg(e) })))
  }
  const detect = (): void => {
    window.api.tools.detect().then(setTools).catch(e => setErr(t('도구를 탐지하지 못했습니다: {e}', { e: msg(e) })))
  }
  const version = (id: string): string | null =>
    [...(tools?.ai ?? []), ...(tools?.runners ?? [])].find(t => t.id === id)?.version ?? null
  // 예전에 별칭(opus 등)으로 저장했어도 같은 모델로 보인다
  const model = models.find(m => m.id === s['ai.model'] || m.aliases?.includes(s['ai.model']))
  const efforts = model?.efforts ?? []

  return (
    <div className="settings">
      <h1>{t('환경설정')}</h1>
      {err && <p className="err" role="alert">{err}</p>}

      <section>
        <h2>AI</h2>
        <p className="muted">{t('코테 연습의 넛지 · 힌트 · 이론 학습에 쓸 로컬 AI 를 고릅니다.')}</p>
        {(['claude', 'gemini', 'codex'] as AiCli[]).map(id => {
          const v = version(id)
          const on = cli === id
          return (
            <div key={id} className={`row cli-row${v ? '' : ' disabled'}${on ? ' on' : ''}`}>
              <label className="cli-pick">
                <input
                  type="radio"
                  name="cli"
                  disabled={!v}
                  checked={on}
                  onChange={() => {
                    save('ai.cli', id)
                    save('ai.model', '')
                    save('ai.effort', '')
                    setCustom(false)
                  }}
                />
                <span className="name">{CLI_LABEL[id]}</span>
                <span className="muted">{v ?? (tools ? t('설치 안 됨') : t('탐지 중…'))}</span>
              </label>
              {on && (
                <div className="cli-opts">
                  {custom && (
                    <input
                      className="field"
                      aria-label={t('모델 이름')}
                      defaultValue={s['ai.model']}
                      placeholder={t('예: {model}', { model: 'claude-opus-5-5' })}
                      onBlur={e => {
                        save('ai.model', e.target.value.trim())
                        save('ai.effort', '')
                      }}
                    />
                  )}
                  <Select
                    label={t('모델')}
                    value={custom ? CUSTOM : model?.id ?? s['ai.model']}
                    options={[{ value: '', label: t('모델: CLI 기본값') }, ...models.map(m => ({ value: m.id, label: m.label ?? m.id, hint: m.label ? m.id : undefined })), { value: CUSTOM, label: t('직접 입력…') }]}
                    onChange={v => {
                      if (v === CUSTOM) return setCustom(true)
                      setCustom(false)
                      save('ai.model', v)
                      save('ai.effort', '')
                    }}
                  />
                  {efforts.length > 0 && (
                    <Select
                      label={t('노력 수준')}
                      value={s['ai.effort']}
                      options={[{ value: '', label: t('노력: 기본값') }, ...efforts.map(x => ({ value: x, label: x }))]}
                      onChange={v => save('ai.effort', v)}
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </section>

      <section>
        <h2>
          {t('언어 실행기')}
          <button className="icon-btn" aria-label={t('다시 탐지')} onClick={detect}>
            <RefreshCw size={16} aria-hidden />
          </button>
        </h2>
        {LANGS.map(l => {
          const vs = l.need.map(version)
          const ok = vs.every(Boolean)
          return (
            <div key={l.label} className={ok ? 'row' : 'row disabled'}>
              <span className="name">{l.label}</span>
              <span className="muted">
                {ok ? vs.join(' · ') : tools ? t('설치 안 됨 ({cmds})', { cmds: l.need.join(' + ') }) : t('탐지 중…')}
              </span>
            </div>
          )
        })}
      </section>

      <section>
        <h2>{t('작업 기록 폴더')}</h2>
        <div className="row">
          <code className="path">{s.historyRoot}</code>
          <button
            className="btn"
            onClick={() =>
              window.api.dialog
                .pickFolder(s.historyRoot)
                .then(p => p && save('historyRoot', p))
                .catch(e => setErr(t('폴더를 고르지 못했습니다: {e}', { e: msg(e) })))
            }
          >
            {t('바꾸기')}
          </button>
          <button
            className="btn"
            onClick={() => {
              setPathErr('')
              window.api.shell.openPath(s.historyRoot).catch(e => setPathErr(msg(e)))
            }}
          >
            {t('열기')}
          </button>
          {pathErr && <span className="err" role="alert">{pathErr}</span>}
        </div>
        {cats.length > 0 && <>
          <div className="row">
            <span className="name">{t('개인 작업')}</span>
            <span className="chips">{cats.map(c => <button key={c} type="button" className="chip-toggle" aria-pressed={s['history.personal'].includes(c)} onClick={() => save('history.personal', s['history.personal'].includes(c) ? s['history.personal'].filter(x => x !== c) : [...s['history.personal'], c])}>{c}</button>)}</span>
          </div>
          <p className="muted row-hint">{t("고른 프로젝트는 이력서에서 회사 경력과 가르고 소속을 '개인'으로 씁니다")}</p>
        </>}
      </section>

      <section>
        <h2>{t('작업 기록을 남기는 때')}</h2>
        <p className="muted">{t('Claude · Codex · Gemini 가 함께 쓰는 work-history 스킬이 이 기준으로 ~/My-History 에 자동으로 기록합니다. 그 밖에는 "기록해 줘"라고 할 때만 남깁니다.')}</p>
        {rules === null && <p className="muted">{t('work-history 스킬이 없습니다(~/.claude/skills/work-history).')}</p>}
        {rules && RECORD_RULES.map(r => (
          <label key={r.key} className="row">
            <input
              type="checkbox"
              checked={rules[r.key]}
              onChange={e => {
                const next = { ...rules, [r.key]: e.target.checked }
                setRules(next)
                window.api.history.setRules(next).then(setRules).catch(x => setErr(t('기록 기준을 저장하지 못했습니다: {e}', { e: msg(x) })))
              }}
            />
            <span>{t(r.label)}</span>
          </label>
        ))}
      </section>

      <section>
        <h2>{t('데이터')}</h2>
        <div className="row">
          <span className="muted">{t('DB 파일 한 개가 전부입니다(백업은 이 폴더를 복사)')}</span>
          <button
            className="btn"
            onClick={() => {
              setPathErr('')
              window.api.app.dataDir().then(window.api.shell.openPath).catch(e => setPathErr(msg(e)))
            }}
          >
            {t('폴더 열기')}
          </button>
        </div>
      </section>

      <section>
        <h2>{t('화면')}</h2>
        <div className="row">
          <span className="name">언어 · Language {/* i18n-ok — 두 언어를 함께 보인다 */}</span>
          <Select
            label="언어 · Language" // i18n-ok
            value={s['ui.lang']}
            options={[{ value: 'system' as UiLangPref, label: t('시스템 설정'), hint: getLang() === 'ko' ? '한국어' : 'English' }, { value: 'ko' as UiLangPref, label: '한국어' }, { value: 'en' as UiLangPref, label: 'English', hint: t('AI 결과도 영어로') }]} // i18n-ok — 언어 이름은 그 언어로
            onChange={l => {
              // 문구는 그릴 때 정해지므로 저장한 뒤 창을 다시 연다
              window.api.settings.set('ui.lang', l).then(() => location.reload(), e => setErr(t('저장하지 못했습니다: {e}', { e: msg(e) })))
            }}
          />
        </div>
        <div className="row">
          <span className="name">{t('테마')}</span>
          <Select
            label={t('테마')}
            value={s.theme}
            options={[{ value: 'system' as Theme, label: t('시스템 설정'), hint: t('맥 설정을 따라 바뀜') }, ...THEMES.map(x => ({ value: x.id as Theme, label: t(x.label), aside: <Swatch id={x.id} /> }))]}
            onChange={v => {
              save('theme', v)
              onTheme({ ...s, theme: v })
            }}
          />
        </div>
        {s.theme === 'system' && (['theme.light', 'theme.dark'] as const).map(k => (
          <div className="row" key={k}>
            <span className="name">{k === 'theme.light' ? t('맥이 밝을 때') : t('맥이 어두울 때')}</span>
            <Select
              label={k === 'theme.light' ? t('맥이 밝을 때 테마') : t('맥이 어두울 때 테마')}
              value={s[k]}
              options={THEMES.filter(x => x.dark === (k === 'theme.dark')).map(x => ({ value: x.id as ThemeName, label: t(x.label), aside: <Swatch id={x.id} /> }))}
              onChange={v => {
                save(k, v)
                onTheme({ ...s, [k]: v })
              }}
            />
          </div>
        ))}
      </section>

      <section>
        <h2>{t('멈춤 넛지')}</h2>
        <label className="row">
          <input type="checkbox" checked={s['nudge.enabled']} onChange={e => save('nudge.enabled', e.target.checked)} />
          <span className="name">{t('코드를 멈추면 방향 제안 보이기')}</span>
        </label>
        <div className="row">
          <span className="name">{t('처음 넛지까지')}</span>
          <NumField
            value={s['nudge.quietMs'] / 1000}
            min={0}
            max={600}
            label={t('처음 넛지까지(초)')}
            onCommit={n => save('nudge.quietMs', Math.round(n * 1000))}
          />
          <span className="muted">{t('초')}</span>
        </div>
        <p className="muted row-hint">{t('문제를 연 뒤 이 시간 동안은 혼자 생각하게 둡니다')}</p>
        <div className="row">
          <span className="name">{t('멈춰 있는 시간')}</span>
          <NumField value={s['nudge.idleMs'] / 1000} min={10} max={600} label={t('멈춰 있는 시간(초)')} onCommit={n => save('nudge.idleMs', Math.round(n * 1000))} />
          <span className="muted">{t('초')}</span>
        </div>
        <p className="muted row-hint">{t('이만큼 입력 · 실행이 없으면 넛지를 띄웁니다')}</p>
        <p className="muted">{s['nudge.enabled']
          ? t('지금 설정: 문제를 연 뒤 {quiet}초가 지나고, {idle}초 동안 멈춰 있으면 코드 편집기의 커서 줄 아래에 넛지가 나옵니다(Esc 로 닫기). 다음에 여는 문제부터 적용됩니다.', { quiet: s['nudge.quietMs'] / 1000, idle: s['nudge.idleMs'] / 1000 })
          : t('넛지를 끄면 단계 안내만 보입니다.')}</p>
      </section>

      <section>
        <h2>{t('이력서')}</h2>
        <div className="row">
          <span className="name">{t('사진')}</span>
          {s['resume.photo'] && <img className="photo-thumb" src={s['resume.photo']} alt={t('이력서 사진')} />}
          <label className="btn">
            {s['resume.photo'] ? t('바꾸기') : t('사진 고르기')}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={e => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) shrink(f).then(url => save('resume.photo', url), er => setErr(t('사진을 읽지 못했습니다: {e}', { e: msg(er) })))
              }}
            />
          </label>
          {s['resume.photo'] && <button type="button" className="btn" onClick={() => save('resume.photo', '')}>{t('빼기')}</button>}
        </div>
        <p className="muted row-hint">{t('이력서 탭의 이름 · 연락처 왼쪽에 나오고 PDF 에도 들어갑니다')}</p>
      </section>

      <section>
        <h2>{t('코드 실행')}</h2>
        <div className="row">
          <span className="name">{t('예제 하나 제한 시간')}</span>
          <NumField value={s['run.timeoutMs'] / 1000} min={1} max={60} label={t('예제 하나 제한 시간(초)')} onCommit={n => save('run.timeoutMs', Math.round(n * 1000))} />
          <span className="muted">{t('초')}</span>
        </div>
      </section>
    </div>
  )
}
