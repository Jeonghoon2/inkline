// 자격증 표 읽기 · 쓰기 — 교재 글과 만든 자료는 이 DB 에만 둔다
import type { DatabaseSync } from 'node:sqlite'
import type { Grade } from '../../shared/drill.ts'
import { DEFAULT_RULES, nextReview, type BookStatus, type CertBook, type CertItem, type CertKind, type CertMaterial, type CertPairRow, type CertQuestion, type CertReview, type CertRules, type CertWrong, type MockScore, type NewQuestion } from '../../shared/cert.ts'
import { t } from '../../shared/i18n.ts'

type Row = Record<string, unknown>
const j = <T>(s: unknown, d: T): T => { try { return typeof s === 'string' ? (JSON.parse(s) as T) : d } catch { return d } }
const toBook = (r: Row): CertBook => ({ id: r.id as number, name: r.name as string, kind: r.kind as CertKind, subjects: j(r.subjects, []), rules: { ...DEFAULT_RULES, ...j<Partial<CertRules>>(r.rules, {}) }, examDate: (r.exam_date as string | null) ?? null, pages: r.pages as number, status: r.status as BookStatus, confirmed: !!r.confirmed, checkNote: (r.check_note as string | undefined) ?? '', createdAt: r.created_at as string })
const toItem = (r: Row): CertItem => ({ id: r.id as number, bookId: r.book_id as number, subject: r.subject as string, title: r.title as string, freq: r.freq as number, freqNote: r.freq_note as string, pageFrom: r.page_from as number, pageTo: r.page_to as number, body: r.body as string, ord: r.ord as number })
const toQ = (r: Row): CertQuestion => ({ id: r.id as number, itemId: r.item_id as number, stem: r.stem as string, choices: j(r.choices, []), answer: r.answer as number, why: r.why as string, notes: j(r.notes, []), quote: r.quote as string, choiceItems: j(r.choice_items, []), refute: r.refute as string, origin: r.origin as CertQuestion['origin'] })
const toRev = (r: Row): CertReview => ({ itemId: r.item_id as number, step: r.step as number, dueAt: r.due_at as string, last: r.last as Grade, right: r.n_right as number, wrong: r.n_wrong as number })

// 한 덩어리로 쓰기 — 중간에 멈추면 반쯤 쓴 줄을 남기지 않는다(겹쳐 부르지 않는다)
export function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN')
  try { const r = fn(); db.exec('COMMIT'); return r } catch (e) { db.exec('ROLLBACK'); throw e }
}

export function createBook(db: DatabaseSync, b: { name: string; kind: CertKind; subjects: string[]; rules: CertRules; pdfPath: string; sha256: string; pages: number; now: Date; checkNote?: string }): number {
  const r = db.prepare('INSERT INTO cert_books (name, kind, subjects, rules, pdf_path, sha256, pages, status, created_at, check_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(b.name, b.kind, JSON.stringify(b.subjects), JSON.stringify(b.rules), b.pdfPath, b.sha256, b.pages, 'importing', b.now.toISOString(), b.checkNote ?? '')
  return Number(r.lastInsertRowid)
}
export const bookBySha = (db: DatabaseSync, sha: string): number | null => ((db.prepare('SELECT id FROM cert_books WHERE sha256 = ?').get(sha) as Row | undefined)?.id as number | undefined) ?? null
export const listBooks = (db: DatabaseSync): CertBook[] => (db.prepare('SELECT * FROM cert_books ORDER BY id').all() as Row[]).map(toBook)
export const getBook = (db: DatabaseSync, id: number): CertBook | null => { const r = db.prepare('SELECT * FROM cert_books WHERE id = ?').get(id) as Row | undefined; return r ? toBook(r) : null }
export function updateBook(db: DatabaseSync, id: number, p: Partial<Pick<CertBook, 'name' | 'kind' | 'subjects' | 'rules' | 'examDate' | 'status' | 'confirmed'>>): CertBook {
  const cols: [string, unknown][] = []
  if (p.name !== undefined) cols.push(['name', p.name])
  if (p.kind !== undefined) cols.push(['kind', p.kind])
  if (p.subjects !== undefined) cols.push(['subjects', JSON.stringify(p.subjects)])
  if (p.rules !== undefined) cols.push(['rules', JSON.stringify(p.rules)])
  if (p.examDate !== undefined) cols.push(['exam_date', p.examDate])
  if (p.status !== undefined) cols.push(['status', p.status])
  if (p.confirmed !== undefined) cols.push(['confirmed', p.confirmed ? 1 : 0])
  if (cols.length) db.prepare(`UPDATE cert_books SET ${cols.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...(cols.map(([, v]) => v) as (string | number | null)[]), id)
  const b = getBook(db, id)
  if (!b) throw new Error(t('과정을 찾지 못했습니다'))
  return b
}
// 지우기 — 자식 표부터(외래 키). 복사한 PDF 경로를 돌려준다
export function deleteBook(db: DatabaseSync, id: number): string | null {
  const r = db.prepare('SELECT pdf_path FROM cert_books WHERE id = ?').get(id) as Row | undefined
  if (!r) return null
  const items = 'SELECT id FROM cert_items WHERE book_id = ?'
  tx(db, () => {
    db.prepare(`DELETE FROM cert_attempts WHERE question_id IN (SELECT id FROM cert_questions WHERE item_id IN (${items}))`).run(id)
    db.prepare('DELETE FROM cert_mocks WHERE book_id = ?').run(id)
    db.prepare(`DELETE FROM cert_questions WHERE item_id IN (${items})`).run(id)
    db.prepare(`DELETE FROM cert_materials WHERE item_id IN (${items})`).run(id)
    db.prepare(`DELETE FROM cert_reviews WHERE item_id IN (${items})`).run(id)
    for (const t of ['cert_pairs', 'cert_items', 'cert_chunks', 'cert_pages']) db.prepare(`DELETE FROM ${t} WHERE book_id = ?`).run(id)
    db.prepare('DELETE FROM cert_books WHERE id = ?').run(id)
  })
  return r.pdf_path as string
}

export function putPages(db: DatabaseSync, bookId: number, pages: string[]): void {
  const st = db.prepare('INSERT OR REPLACE INTO cert_pages (book_id, page, text) VALUES (?, ?, ?)')
  pages.forEach((t, i) => st.run(bookId, i + 1, t))
}
export const getPages = (db: DatabaseSync, bookId: number): string[] => (db.prepare('SELECT text FROM cert_pages WHERE book_id = ? ORDER BY page').all(bookId) as Row[]).map(r => r.text as string)

export type ChunkRow = { chunk: number; from: number; to: number; state: 'todo' | 'done' | 'retry' | 'failed'; tries: number }
export function putChunks(db: DatabaseSync, bookId: number, cs: { chunk: number; from: number; to: number }[]): void {
  const st = db.prepare('INSERT OR IGNORE INTO cert_chunks (book_id, chunk, page_from, page_to, state) VALUES (?, ?, ?, ?, ?)')
  for (const c of cs) st.run(bookId, c.chunk, c.from, c.to, 'todo')
}
export const chunksOf = (db: DatabaseSync, bookId: number): ChunkRow[] =>
  (db.prepare('SELECT chunk, page_from, page_to, state, tries FROM cert_chunks WHERE book_id = ? ORDER BY chunk').all(bookId) as Row[]).map(r => ({ chunk: r.chunk as number, from: r.page_from as number, to: r.page_to as number, state: r.state as ChunkRow['state'], tries: r.tries as number }))
export function setChunk(db: DatabaseSync, bookId: number, chunk: number, state: ChunkRow['state'], bumpTry = false): void {
  db.prepare(`UPDATE cert_chunks SET state = ?${bumpTry ? ', tries = tries + 1' : ''} WHERE book_id = ? AND chunk = ?`).run(state, bookId, chunk)
}

export type AnchorIn = { subject: string; title: string; freq: number; freqNote: string; anchor: string; pos: number }
// 겹친 쪽에서 같은 항목을 두 번 찾으면 위치가 거의 같다 — ±20자 안에 이미 있으면 넣지 않는다
export function addAnchors(db: DatabaseSync, bookId: number, a: AnchorIn[]): number {
  const near = db.prepare('SELECT 1 FROM cert_items WHERE book_id = ? AND pos BETWEEN ? AND ?')
  const ins = db.prepare('INSERT INTO cert_items (book_id, subject, title, freq, freq_note, anchor, pos) VALUES (?, ?, ?, ?, ?, ?, ?)')
  let n = 0
  for (const x of a) {
    if (near.get(bookId, x.pos - 20, x.pos + 20)) continue
    ins.run(bookId, x.subject, x.title, x.freq, x.freqNote, x.anchor, x.pos); n++
  }
  return n
}
export const anchorsOf = (db: DatabaseSync, bookId: number): { id: number; pos: number; title: string }[] => (db.prepare('SELECT id, pos, title FROM cert_items WHERE book_id = ? ORDER BY pos').all(bookId) as Row[]).map(r => ({ id: r.id as number, pos: r.pos as number, title: r.title as string }))
export function setBodies(db: DatabaseSync, rows: { id: number; body: string; pageFrom: number; pageTo: number; ord: number }[]): void {
  const st = db.prepare('UPDATE cert_items SET body = ?, page_from = ?, page_to = ?, ord = ? WHERE id = ?')
  tx(db, () => { for (const r of rows) st.run(r.body, r.pageFrom, r.pageTo, r.ord, r.id) })
}
export const itemsOf = (db: DatabaseSync, bookId: number): CertItem[] => (db.prepare('SELECT * FROM cert_items WHERE book_id = ? ORDER BY ord, pos').all(bookId) as Row[]).map(toItem)
export const getItem = (db: DatabaseSync, id: number): CertItem | null => { const r = db.prepare('SELECT * FROM cert_items WHERE id = ?').get(id) as Row | undefined; return r ? toItem(r) : null }

export function putMaterial(db: DatabaseSync, itemId: number, m: CertMaterial, cli: string | null, model: string, now: Date): void {
  db.prepare('INSERT OR REPLACE INTO cert_materials (item_id, explain, mnemonic, confusions, cli, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(itemId, m.explain, m.mnemonic, JSON.stringify(m.confusions), cli, model, now.toISOString())
}
export function getMaterial(db: DatabaseSync, itemId: number): CertMaterial | null {
  const r = db.prepare('SELECT explain, mnemonic, confusions FROM cert_materials WHERE item_id = ?').get(itemId) as Row | undefined
  return r ? { explain: r.explain as string, mnemonic: r.mnemonic as string, confusions: j(r.confusions, []) } : null
}
export function addQuestions(db: DatabaseSync, itemId: number, qs: NewQuestion[], origin: CertQuestion['origin']): number[] {
  const st = db.prepare('INSERT INTO cert_questions (item_id, stem, choices, answer, why, notes, quote, choice_items, refute, origin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  const at = new Date().toISOString()
  return qs.map(q => Number(st.run(itemId, q.stem, JSON.stringify(q.choices), q.answer, q.why, JSON.stringify(q.notes), q.quote, JSON.stringify(q.choiceItems), q.refute, origin, at).lastInsertRowid))
}
export const questionsOf = (db: DatabaseSync, itemId: number): CertQuestion[] => (db.prepare('SELECT * FROM cert_questions WHERE item_id = ? ORDER BY id').all(itemId) as Row[]).map(toQ)
// 항목 제 문제 — 쌍 비교 카드가 붙인 문제는 그 항목의 자료로 치지 않는다
export const ownQuestions = (db: DatabaseSync, itemId: number): CertQuestion[] => questionsOf(db, itemId).filter(q => q.origin !== 'pair')
export const bookQuestions = (db: DatabaseSync, bookId: number): CertQuestion[] => (db.prepare('SELECT q.* FROM cert_questions q JOIN cert_items i ON i.id = q.item_id WHERE i.book_id = ? ORDER BY q.id').all(bookId) as Row[]).map(toQ)
export const getQuestion = (db: DatabaseSync, id: number): CertQuestion | null => { const r = db.prepare('SELECT * FROM cert_questions WHERE id = ?').get(id) as Row | undefined; return r ? toQ(r) : null }

export const reviewsOf = (db: DatabaseSync, bookId: number): CertReview[] => (db.prepare('SELECT r.* FROM cert_reviews r JOIN cert_items i ON i.id = r.item_id WHERE i.book_id = ?').all(bookId) as Row[]).map(toRev)
export function gradeItem(db: DatabaseSync, itemId: number, grade: Grade, correct: boolean, now: Date, examDate: string | null): CertReview {
  const prev = db.prepare('SELECT step FROM cert_reviews WHERE item_id = ?').get(itemId) as { step: number } | undefined
  const s = nextReview(prev ?? null, grade, now, examDate)
  db.prepare(`INSERT INTO cert_reviews (item_id, step, due_at, last, n_right, n_wrong, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET step = excluded.step, due_at = excluded.due_at, last = excluded.last, n_right = n_right + excluded.n_right, n_wrong = n_wrong + excluded.n_wrong, updated_at = excluded.updated_at`)
    .run(itemId, s.step, s.dueAt, grade, correct ? 1 : 0, correct ? 0 : 1, now.toISOString())
  return toRev(db.prepare('SELECT * FROM cert_reviews WHERE item_id = ?').get(itemId) as Row)
}

export function addAttempt(db: DatabaseSync, a: { questionId: number; picked: number | null; correct: boolean; sure: boolean; mode: 'learn' | 'review' | 'mock'; mockId?: number | null; now: Date }): void {
  db.prepare('INSERT INTO cert_attempts (question_id, picked, correct, sure, mode, mock_id, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(a.questionId, a.picked, a.correct ? 1 : 0, a.sure ? 1 : 0, a.mode, a.mockId ?? null, a.now.toISOString())
}
export function attemptCounts(db: DatabaseSync, bookId: number): Map<number, number> {
  const rows = db.prepare('SELECT a.question_id AS q, COUNT(*) AS n FROM cert_attempts a JOIN cert_questions q ON q.id = a.question_id JOIN cert_items i ON i.id = q.item_id WHERE i.book_id = ? GROUP BY a.question_id').all(bookId) as Row[]
  return new Map(rows.map(r => [r.q as number, r.n as number]))
}
// 최근 n 문제 정답률(%) — 푼 문제가 없으면 null
export function recentRate(db: DatabaseSync, bookId: number, subject: string, n = 30): number | null {
  const rows = db.prepare('SELECT a.correct FROM cert_attempts a JOIN cert_questions q ON q.id = a.question_id JOIN cert_items i ON i.id = q.item_id WHERE i.book_id = ? AND i.subject = ? ORDER BY a.id DESC LIMIT ?').all(bookId, subject, n) as Row[]
  return rows.length ? Math.round((rows.filter(r => r.correct).length / rows.length) * 100) : null
}

export function createMock(db: DatabaseSync, bookId: number, qids: number[], now: Date): number {
  return Number(db.prepare('INSERT INTO cert_mocks (book_id, started_at, question_ids) VALUES (?, ?, ?)').run(bookId, now.toISOString(), JSON.stringify(qids)).lastInsertRowid)
}
export function getMock(db: DatabaseSync, id: number): { id: number; bookId: number; questionIds: number[]; finishedAt: string | null } | null {
  const r = db.prepare('SELECT * FROM cert_mocks WHERE id = ?').get(id) as Row | undefined
  return r ? { id: r.id as number, bookId: r.book_id as number, questionIds: j(r.question_ids, []), finishedAt: (r.finished_at as string | null) ?? null } : null
}
export function finishMock(db: DatabaseSync, id: number, scores: MockScore, now: Date): void {
  db.prepare('UPDATE cert_mocks SET finished_at = ?, scores = ? WHERE id = ?').run(now.toISOString(), JSON.stringify(scores), id)
}

// 오답 노트 — 한 번이라도 틀린 문제의 마지막 오답. 그 뒤에 맞혔으면 fixed. 확실했는데 틀림 먼저(지식사전: 학습 과학/errors-committed-with-high-confidence-are-hypercorrected)
export function wrongNote(db: DatabaseSync, bookId: number): CertWrong[] {
  const rows = db.prepare(`SELECT a.question_id AS qid, a.picked, a.sure, a.at, a.id AS aid, i.subject, i.title,
      (SELECT COUNT(*) FROM cert_attempts b WHERE b.question_id = a.question_id AND b.id > a.id AND b.correct = 1) AS later
    FROM cert_attempts a JOIN cert_questions q ON q.id = a.question_id JOIN cert_items i ON i.id = q.item_id
    WHERE i.book_id = ? AND a.correct = 0 AND a.id = (SELECT MAX(c.id) FROM cert_attempts c WHERE c.question_id = a.question_id AND c.correct = 0)
    ORDER BY a.sure DESC, a.id DESC`).all(bookId) as Row[]
  return rows.map(r => {
    const q = getQuestion(db, r.qid as number)!
    return { questionId: q.id, subject: r.subject as string, itemTitle: r.title as string, stem: q.stem, choices: q.choices, answer: q.answer, picked: (r.picked as number | null) ?? null, sure: !!r.sure, why: q.why, notes: q.notes, at: r.at as string, fixed: (r.later as number) > 0 }
  })
}

const ord = (x: number, y: number): [number, number] => (x < y ? [x, y] : [y, x])
export function bumpPair(db: DatabaseSync, bookId: number, x: number, y: number): number {
  const [a, b] = ord(x, y)
  db.prepare('INSERT INTO cert_pairs (book_id, a, b, count) VALUES (?, ?, ?, 1) ON CONFLICT(book_id, a, b) DO UPDATE SET count = count + 1').run(bookId, a, b)
  return (db.prepare('SELECT count FROM cert_pairs WHERE book_id = ? AND a = ? AND b = ?').get(bookId, a, b) as Row).count as number
}
export function pairsOf(db: DatabaseSync, bookId: number): CertPairRow[] {
  return (db.prepare('SELECT p.a, p.b, p.count, p.card, x.title AS at, y.title AS bt FROM cert_pairs p JOIN cert_items x ON x.id = p.a JOIN cert_items y ON y.id = p.b WHERE p.book_id = ? ORDER BY p.count DESC').all(bookId) as Row[])
    .map(r => ({ a: r.a as number, b: r.b as number, aTitle: r.at as string, bTitle: r.bt as string, count: r.count as number, hasCard: r.card !== null }))
}
export function getPair(db: DatabaseSync, bookId: number, x: number, y: number): { count: number; card: { diffs: string[]; common: string; questionIds: number[] } | null } | null {
  const [a, b] = ord(x, y)
  const r = db.prepare('SELECT count, card FROM cert_pairs WHERE book_id = ? AND a = ? AND b = ?').get(bookId, a, b) as Row | undefined
  return r ? { count: r.count as number, card: j(r.card, null) } : null
}
export function setPairCard(db: DatabaseSync, bookId: number, x: number, y: number, card: { diffs: string[]; common: string; questionIds: number[] }): void {
  const [a, b] = ord(x, y)
  db.prepare('UPDATE cert_pairs SET card = ? WHERE book_id = ? AND a = ? AND b = ?').run(JSON.stringify(card), bookId, a, b)
}
