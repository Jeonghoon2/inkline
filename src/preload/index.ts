import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { CertStage } from '../shared/cert.ts'
import type { Api, ResumeStage, TheoryStage } from '../shared/types.ts'

// main → renderer 이벤트는 허용한 채널만 구독한다
const EVENTS = new Set(['history:changed', 'coding:changed', 'tutor:mistakesChanged', 'shorts:changed'])
function on(channel: string, cb: () => void): () => void {
  if (!EVENTS.has(channel)) throw new Error(`모르는 이벤트: ${channel}`)
  const h = (_e: IpcRendererEvent): void => cb()
  ipcRenderer.on(channel, h)
  return () => {
    ipcRenderer.removeListener(channel, h)
  }
}

const api: Api = {
  settings: {
    all: () => ipcRenderer.invoke('settings:all'),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value)
  },
  tools: {
    detect: () => ipcRenderer.invoke('tools:detect'),
    models: cli => ipcRenderer.invoke('tools:models', cli)
  },
  dialog: { pickFolder: defaultPath => ipcRenderer.invoke('dialog:pickFolder', defaultPath) },
  shell: { openPath: path => ipcRenderer.invoke('shell:openPath', path) },
  app: { dataDir: () => ipcRenderer.invoke('app:dataDir'), titleBar: (color: string, symbol: string) => ipcRenderer.invoke('app:titleBar', color, symbol) },
  history: {
    load: () => ipcRenderer.invoke('history:load'),
    rules: () => ipcRenderer.invoke('history:rules'),
    setRules: r => ipcRenderer.invoke('history:setRules', r),
    onChanged: cb => on('history:changed', cb)
  },
  shorts: {
    make: name => ipcRenderer.invoke('shorts:make', name),
    jobs: () => ipcRenderer.invoke('shorts:jobs'),
    onChanged: cb => on('shorts:changed', cb)
  },
  resume: {
    savePdf: defaultName => ipcRenderer.invoke('resume:savePdf', defaultName),
    since: slug => ipcRenderer.invoke('resume:since', slug),
    update: slug => ipcRenderer.invoke('resume:update', slug),
    review: slug => ipcRenderer.invoke('resume:review', slug),
    head: () => ipcRenderer.invoke('resume:head'),
    setHead: h => ipcRenderer.invoke('resume:setHead', h),
    addRole: slug => ipcRenderer.invoke('resume:addRole', slug),
    research: slug => ipcRenderer.invoke('resume:research', slug),
    onStage: cb => { const h = (_e: IpcRendererEvent, s: ResumeStage): void => cb(s); ipcRenderer.on('resume:stage', h); return () => { ipcRenderer.removeListener('resume:stage', h) } },
    cancel: () => ipcRenderer.invoke('resume:cancel'),
    save: (slug, changes, through) => ipcRenderer.invoke('resume:save', slug, changes, through),
    backups: slug => ipcRenderer.invoke('resume:backups', slug),
    restore: (slug, name) => ipcRenderer.invoke('resume:restore', slug, name)
  },
  reports: {
    make: (week, cats, audience) => ipcRenderer.invoke('reports:make', week, cats, audience),
    save: (name, text, overwrite) => ipcRenderer.invoke('reports:save', name, text, overwrite),
    cancel: () => ipcRenderer.invoke('reports:cancel'),
    rename: (from, to) => ipcRenderer.invoke('reports:rename', from, to),
    remove: name => ipcRenderer.invoke('reports:remove', name)
  },
  knowledge: {
    load: () => ipcRenderer.invoke('knowledge:load'),
    save: (item, prev, pdf) => ipcRenderer.invoke('knowledge:save', item, prev, pdf),
    remove: (category, slug) => ipcRenderer.invoke('knowledge:remove', category, slug),
    draft: input => ipcRenderer.invoke('knowledge:draft', input),
    cancelDraft: () => ipcRenderer.invoke('knowledge:cancelDraft'),
    browse: (category, slug) => ipcRenderer.invoke('knowledge:browse', category, slug),
    pickPdf: () => ipcRenderer.invoke('knowledge:pickPdf'),
    attach: (category, slug, path) => ipcRenderer.invoke('knowledge:attach', category, slug, path),
    openFile: (category, file) => ipcRenderer.invoke('knowledge:openFile', category, file),
    pathForFile: f => webUtils.getPathForFile(f)
  },
  coding: {
    import: url => ipcRenderer.invoke('coding:import', url),
    login: site => ipcRenderer.invoke('coding:login', site),
    list: () => ipcRenderer.invoke('coding:list'),
    passedIds: () => ipcRenderer.invoke('coding:passedIds'),
    statuses: () => ipcRenderer.invoke('coding:statuses'),
    get: id => ipcRenderer.invoke('coding:get', id),
    classify: id => ipcRenderer.invoke('coding:classify', id),
    onChanged: cb => on('coding:changed', cb)
  },
  practice: {
    start: (problemId, lang, mode) => ipcRenderer.invoke('practice:start', problemId, lang, mode),
    finish: (id, passed, reflection) => ipcRenderer.invoke('practice:finish', id, passed, reflection),
    giveUp: id => ipcRenderer.invoke('practice:giveUp', id),
    report: id => ipcRenderer.invoke('practice:report', id),
    save: (id, lang, code) => ipcRenderer.invoke('practice:save', id, lang, code),
    stage: (id, stage, addMs) => ipcRenderer.invoke('practice:stage', id, stage, addMs),
    predict: (id, text) => ipcRenderer.invoke('practice:predict', id, text),
    run: (id, lang, code) => ipcRenderer.invoke('practice:run', id, lang, code),
    support: (problemId, lang) => ipcRenderer.invoke('practice:support', problemId, lang),
    cancelRun: () => ipcRenderer.invoke('practice:cancelRun'),
    lastRun: id => ipcRenderer.invoke('practice:lastRun', id),
    cases: pid => ipcRenderer.invoke('practice:cases', pid),
    addCase: (pid, args, expected) => ipcRenderer.invoke('practice:addCase', pid, args, expected),
    removeCase: cid => ipcRenderer.invoke('practice:removeCase', cid)
  },
  drill: { state: () => ipcRenderer.invoke('drill:state'), grade: (c, q, g) => ipcRenderer.invoke('drill:grade', c, q, g) },
  review: { due: () => ipcRenderer.invoke('review:due') },
  tutor: {
    nudge: (id, code, stage) => ipcRenderer.invoke('tutor:nudge', id, code, stage),
    hints: id => ipcRenderer.invoke('tutor:hints', id),
    nextHint: (id, code, stage, selfExplain) => ipcRenderer.invoke('tutor:nextHint', id, code, stage, selfExplain),
    answerStage: (hintId, stage) => ipcRenderer.invoke('tutor:answerStage', hintId, stage),
    mistakes: problemId => ipcRenderer.invoke('tutor:mistakes', problemId),
    mistakeBook: () => ipcRenderer.invoke('tutor:mistakeBook'),
    onMistakes: cb => on('tutor:mistakesChanged', cb)
  },
  theory: {
    onStage: cb => { const h = (_e: IpcRendererEvent, st: TheoryStage): void => cb(st); ipcRenderer.on('theory:stage', h); return () => { ipcRenderer.removeListener('theory:stage', h) } },
    approaches: (attemptId, refresh) => ipcRenderer.invoke('theory:approaches', attemptId, refresh),
    scenes: (attemptId, concept, part, firstTry, refresh) => ipcRenderer.invoke('theory:scenes', attemptId, concept, part, firstTry, refresh),
    limits: attemptId => ipcRenderer.invoke('theory:limits', attemptId),
    cancel: () => ipcRenderer.invoke('theory:cancel'),
    familiar: (attemptId, tag) => ipcRenderer.invoke('theory:familiar', attemptId, tag),
    choose: (attemptId, pick) => ipcRenderer.invoke('theory:choose', attemptId, pick),
    chosen: attemptId => ipcRenderer.invoke('theory:chosen', attemptId),
    log: (attemptId, explain) => ipcRenderer.invoke('theory:log', attemptId, explain)
  },
  cert: {
    list: () => ipcRenderer.invoke('cert:list'),
    pickPdf: () => ipcRenderer.invoke('cert:pickPdf'),
    pathForFile: f => webUtils.getPathForFile(f),
    import: path => ipcRenderer.invoke('cert:import', path),
    confirm: (bookId, patch) => ipcRenderer.invoke('cert:confirm', bookId, patch),
    segment: bookId => ipcRenderer.invoke('cert:segment', bookId),
    onStage: cb => { const h = (_e: IpcRendererEvent, s: CertStage): void => cb(s); ipcRenderer.on('cert:stage', h); return () => { ipcRenderer.removeListener('cert:stage', h) } },
    cancel: () => ipcRenderer.invoke('cert:cancel'),
    home: bookId => ipcRenderer.invoke('cert:home', bookId),
    next: (bookId, subject) => ipcRenderer.invoke('cert:next', bookId, subject),
    answer: (questionId, picked, sure, mode) => ipcRenderer.invoke('cert:answer', questionId, picked, sure, mode),
    seen: itemId => ipcRenderer.invoke('cert:seen', itemId),
    page: (bookId, page) => ipcRenderer.invoke('cert:page', bookId, page),
    mockStart: bookId => ipcRenderer.invoke('cert:mockStart', bookId),
    mockSubmit: (mockId, picks) => ipcRenderer.invoke('cert:mockSubmit', mockId, picks),
    wrongs: bookId => ipcRenderer.invoke('cert:wrongs', bookId),
    pairs: bookId => ipcRenderer.invoke('cert:pairs', bookId),
    pairCard: (bookId, a, b) => ipcRenderer.invoke('cert:pairCard', bookId, a, b),
    remove: bookId => ipcRenderer.invoke('cert:remove', bookId)
  }
}
contextBridge.exposeInMainWorld('api', api)
