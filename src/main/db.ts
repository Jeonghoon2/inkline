import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isDarkTheme, isThemeName } from '../shared/themes.ts'
import { DatabaseSync } from 'node:sqlite'
import { AI_CLIS, LANGS, SETUP_INSTALLS, type AiCli, type Settings } from '../shared/types.ts'
import { UI_LANG_PREFS } from '../shared/i18n.ts'

// 끝에만 덧붙인다. i 번째 항목을 적용하면 user_version = i + 1
export const MIGRATIONS: string[] = [
  `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  `CREATE TABLE problems (
    id INTEGER PRIMARY KEY,
    site TEXT NOT NULL,
    site_id TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    html TEXT NOT NULL,
    examples TEXT NOT NULL,
    starter TEXT NOT NULL,
    signature TEXT,
    site_level TEXT NOT NULL,
    site_tags TEXT NOT NULL,
    classification TEXT,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE attempts (id INTEGER PRIMARY KEY, problem_id INTEGER NOT NULL REFERENCES problems(id), mode TEXT NOT NULL, lang TEXT NOT NULL, code TEXT NOT NULL, stage TEXT NOT NULL, stage_ms TEXT NOT NULL, predicted TEXT, passed INTEGER NOT NULL DEFAULT 0, started_at TEXT NOT NULL, ended_at TEXT);
  CREATE TABLE runs (id INTEGER PRIMARY KEY, attempt_id INTEGER NOT NULL REFERENCES attempts(id), lang TEXT NOT NULL, results TEXT NOT NULL, passed INTEGER NOT NULL, at TEXT NOT NULL);
  CREATE INDEX attempts_problem ON attempts(problem_id);`,
  `CREATE TABLE hints (id INTEGER PRIMARY KEY, attempt_id INTEGER NOT NULL REFERENCES attempts(id), level INTEGER NOT NULL, body TEXT NOT NULL, self_explain TEXT, at TEXT NOT NULL);
  CREATE TABLE mistakes (id INTEGER PRIMARY KEY, attempt_id INTEGER NOT NULL REFERENCES attempts(id), problem_id INTEGER NOT NULL REFERENCES problems(id), type TEXT NOT NULL, line INTEGER, note TEXT NOT NULL, code_hash TEXT NOT NULL, at TEXT NOT NULL);
  CREATE INDEX hints_attempt ON hints(attempt_id);
  CREATE INDEX mistakes_problem ON mistakes(problem_id);`,
  `ALTER TABLE problems ADD COLUMN approaches TEXT;
  ALTER TABLE attempts ADD COLUMN theory TEXT;
  CREATE TABLE scenes (key TEXT PRIMARY KEY, body TEXT NOT NULL, cli TEXT, model TEXT NOT NULL, created_at TEXT NOT NULL);`,
  `ALTER TABLE attempts ADD COLUMN reflection TEXT;
  ALTER TABLE attempts ADD COLUMN site_passed INTEGER NOT NULL DEFAULT 0;
  CREATE TABLE reviews (problem_id INTEGER PRIMARY KEY REFERENCES problems(id), due_at TEXT NOT NULL, step INTEGER NOT NULL, status TEXT NOT NULL);
  CREATE INDEX mistakes_attempt_type ON mistakes(attempt_id, type);`,
  `DELETE FROM mistakes WHERE id NOT IN (SELECT MAX(id) FROM mistakes GROUP BY attempt_id, type);`,
  `CREATE TABLE custom_cases (id INTEGER PRIMARY KEY, problem_id INTEGER NOT NULL REFERENCES problems(id), args TEXT NOT NULL, expected TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE INDEX custom_cases_problem ON custom_cases(problem_id);`,
  `CREATE TABLE drill (concept TEXT NOT NULL, q INTEGER NOT NULL, step INTEGER NOT NULL, due_at TEXT NOT NULL, last TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(concept, q));`,
  `CREATE TABLE cert_books (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, subjects TEXT NOT NULL, rules TEXT NOT NULL, exam_date TEXT, pdf_path TEXT NOT NULL, sha256 TEXT NOT NULL UNIQUE, pages INTEGER NOT NULL, status TEXT NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
  CREATE TABLE cert_pages (book_id INTEGER NOT NULL REFERENCES cert_books(id), page INTEGER NOT NULL, text TEXT NOT NULL, PRIMARY KEY(book_id, page));
  CREATE TABLE cert_chunks (book_id INTEGER NOT NULL REFERENCES cert_books(id), chunk INTEGER NOT NULL, page_from INTEGER NOT NULL, page_to INTEGER NOT NULL, state TEXT NOT NULL, tries INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(book_id, chunk));
  CREATE TABLE cert_items (id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL REFERENCES cert_books(id), subject TEXT NOT NULL, title TEXT NOT NULL, freq INTEGER NOT NULL, freq_note TEXT NOT NULL, anchor TEXT NOT NULL, pos INTEGER NOT NULL, page_from INTEGER NOT NULL DEFAULT 0, page_to INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL DEFAULT '', ord INTEGER NOT NULL DEFAULT 0, UNIQUE(book_id, pos));
  CREATE TABLE cert_materials (item_id INTEGER PRIMARY KEY REFERENCES cert_items(id), explain TEXT NOT NULL, mnemonic TEXT NOT NULL, confusions TEXT NOT NULL, cli TEXT, model TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE cert_questions (id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES cert_items(id), stem TEXT NOT NULL, choices TEXT NOT NULL, answer INTEGER NOT NULL, why TEXT NOT NULL, notes TEXT NOT NULL, quote TEXT NOT NULL, choice_items TEXT NOT NULL, refute TEXT NOT NULL, origin TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE cert_reviews (item_id INTEGER PRIMARY KEY REFERENCES cert_items(id), step INTEGER NOT NULL, due_at TEXT NOT NULL, last TEXT NOT NULL, n_right INTEGER NOT NULL, n_wrong INTEGER NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE cert_mocks (id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL REFERENCES cert_books(id), started_at TEXT NOT NULL, finished_at TEXT, question_ids TEXT NOT NULL, scores TEXT);
  CREATE TABLE cert_attempts (id INTEGER PRIMARY KEY, question_id INTEGER NOT NULL REFERENCES cert_questions(id), picked INTEGER, correct INTEGER NOT NULL, sure INTEGER NOT NULL, mode TEXT NOT NULL, mock_id INTEGER REFERENCES cert_mocks(id), at TEXT NOT NULL);
  CREATE TABLE cert_pairs (book_id INTEGER NOT NULL REFERENCES cert_books(id), a INTEGER NOT NULL, b INTEGER NOT NULL, count INTEGER NOT NULL, card TEXT, PRIMARY KEY(book_id, a, b));
  CREATE INDEX cert_items_book ON cert_items(book_id, ord);
  CREATE INDEX cert_questions_item ON cert_questions(item_id);
  CREATE INDEX cert_attempts_q ON cert_attempts(question_id);`,
  `ALTER TABLE cert_books ADD COLUMN check_note TEXT NOT NULL DEFAULT '';`,
  'ALTER TABLE problems ADD COLUMN approach_check TEXT;'
]

// 코테 기록 · 설정은 이 파일 하나뿐 — 마이그레이션 전과 하루 한 번 backups/ 에 복사해 둔다(최근 7개)
const stamp = (d: Date): string => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
export function backupDb(db: DatabaseSync, file: string, why: string, now = new Date()): string | null {
  if (file === ':memory:') return null
  const dir = join(dirname(file), 'backups')
  mkdirSync(dir, { recursive: true })
  const out = join(dir, `inkline-${stamp(now)}-${why}.db`)
  if (existsSync(out)) return null
  db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`)
  const old = readdirSync(dir).filter(n => /^inkline-\d{8}-.+\.db$/.test(n)).sort()
  for (const n of old.slice(0, Math.max(0, old.length - 7))) rmSync(join(dir, n), { force: true })
  return out
}

export function openDb(file: string): DatabaseSync {
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number }
  if (user_version > 0 && user_version < MIGRATIONS.length) backupDb(db, file, `v${user_version}`)
  for (let i = user_version; i < MIGRATIONS.length; i++) {
    db.exec('BEGIN')
    try {
      db.exec(MIGRATIONS[i])
      db.exec(`PRAGMA user_version = ${i + 1}`)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }
  if (user_version > 0) { try { backupDb(db, file, 'daily') } catch (e) { console.error('DB 백업 실패', e) } }
  return db
}

export function isValidSetting(key: string, value: unknown, defaults: Settings): boolean {
  if (!Object.hasOwn(defaults, key)) return false
  if (key === 'ai.cli') return value === null || AI_CLIS.includes(value as never)
  if (key === 'setup.install') return SETUP_INSTALLS.includes(value as never)
  if (key === 'ui.lang') return UI_LANG_PREFS.includes(value as never)
  if (key === 'theme') return value === 'system' || isThemeName(value)
  if (key === 'theme.light') return isThemeName(value) && !isDarkTheme(value)
  if (key === 'theme.dark') return isThemeName(value) && isDarkTheme(value)
  if (key === 'run.timeoutMs') return Number.isInteger(value) && (value as number) >= 1000 && (value as number) <= 60_000
  if (key === 'nudge.quietMs') return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 600_000
  if (key === 'nudge.idleMs') return Number.isInteger(value) && (value as number) >= 10_000 && (value as number) <= 600_000
  if (key.endsWith('Ms')) return Number.isInteger(value) && (value as number) >= 0
  if (key === 'ai.model' || key === 'ai.effort') return typeof value === 'string' && !value.startsWith('-') // argv 값이 된다
  if (key === 'historyRoot') return typeof value === 'string' && value !== ''
  if (key === 'coding.lang') return LANGS.includes(value as never)
  if (key === 'report.excluded' || key === 'history.personal') return (Array.isArray(value) && value.length <= 200 && value.every(v => typeof v === 'string' && v.length <= 100))
  if (key === 'resume.through') return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length <= 50 && Object.entries(value).every(([k, v]) => /^[a-z0-9-]{1,60}$/.test(k) && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))
  if (key === 'resume.backupThrough') return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length <= 200 && Object.entries(value).every(([k, v]) => /^[a-z0-9-]+-\d{8}-\d{6}(-\d+)?\.md$/.test(k) && typeof v === 'string' && (v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v)))
  if (key === 'resume.photo') return value === '' || (typeof value === 'string' && value.length <= 1_500_000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value))
  return typeof value === typeof (defaults as unknown as Record<string, unknown>)[key]
}

export function getSettings(db: DatabaseSync, defaults: Settings): Settings {
  const out: Settings = { ...defaults }
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  for (const { key, value } of rows) {
    let v: unknown
    try {
      v = JSON.parse(value)
    } catch {
      continue // 깨진 행은 기본값 유지
    }
    if (isValidSetting(key, v, defaults)) (out as unknown as Record<string, unknown>)[key] = v
  }
  return out
}

// 새로 깐 앱은 AI 가 비어 있다 — 한 번도 고른 적이 없으면 깔린 CLI 중 첫째(Claude Code → Gemini → Codex)를 고른다.
// 환경설정에서 '없음'을 고른 사용자는 값이 저장돼 있어 건드리지 않는다
export function pickFirstAi(db: DatabaseSync, installed: { id: string, version: string | null }[]): void {
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'ai.cli'").get()) return
  const first = installed.find(x => x.version !== null)
  if (first) setSetting(db, 'ai.cli', first.id as AiCli)
}

export function setSetting<K extends keyof Settings>(db: DatabaseSync, key: K, value: Settings[K]): void {
  db.prepare(
    'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, JSON.stringify(value))
}
