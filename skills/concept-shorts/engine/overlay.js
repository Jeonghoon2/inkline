// 쇼츠 글자 층 — 시각 t 의 제목·요점 띠·자막·끝 화면을 계산한다(그리기는 부르는 쪽이)
// player.html(지금 재생기·품질 검사)과 remotion/(조립)이 같이 쓴다 — 두 곳의 글자 배치가 같아야 품질 검사가 잰 화면이 곧 영상이다
// 글자 크기 맞춤(textW·fit)과 공용 계산도 여기 하나 — player.html 의 그림 부품도 이것을 쓴다
;(g => {
  const FADE = 0.45 // 박자가 바뀔 때 그림이 변하는 시간(초)
  const TAIL = 1.6 // 마지막 대사 뒤 끝 화면 시간(초)
  const GAP = 0.3 // shorts.mjs 의 박자 사이 쉼 — 대사 길이를 못 받았을 때 어림에 쓴다
  const C = t => `var(--${t && t !== 'plain' ? t : 'fg'})`
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const clamp = x => Math.max(0, Math.min(1, x))
  const ease = x => 1 - (1 - x) ** 3
  const textW = s => [...String(s ?? '')].reduce((w, ch) => w + (/[ㄱ-힝]/.test(ch) ? 1 : /[WM]/.test(ch) ? 0.95 : /[A-Z]/.test(ch) ? 0.72 : /[a-z]/.test(ch) ? 0.56 : /\d/.test(ch) ? 0.62 : ch === ' ' ? 0.3 : 0.5), 0) // 글자 폭(em) 어림 — 굵은 글꼴 기준, 넓은 W·M 은 따로
  const fit = (s, width, max, min = 0.6 * max) => Math.max(min, Math.min(max, Math.floor(width / Math.max(1, ...String(s ?? '').split(' ').map(textW))))) // 가장 긴 낱말이 한 줄에 들어가는 크기

  // 지금 박자 — i(번호), U(박자 시작부터 초), DUR(그 박자 대사 길이), p(그림이 바뀌는 정도)
  function beatAt(S, starts, durs, total, t) {
    let i = 0
    while (i + 1 < starts.length && t >= starts[i + 1]) i++
    const U = Math.max(0, t - starts[i])
    const DUR = durs[i] ?? Math.max(0.8, (starts[i + 1] ?? total - TAIL) - starts[i] - GAP)
    return { i, b: S.beats[i], prev: S.beats[i - 1], U, DUR, p: ease(clamp(U / FADE)) }
  }

  function layers(S, starts, durs, total, t) {
    const { b, prev, U, DUR, p } = beatAt(S, starts, durs, total, t)
    // 요점 띠 — 앞 글자는 위로 사라지고 새 글자가 아래에서 올라온다
    const band = (x, o, dy) => `<div style="font-size:${fit(x.band.text.replace(/ /g, ''), 960, 46, 30)}px;color:${C(x.band.tone)};opacity:${o};transform:translateY(${dy.toFixed(1)}px)">${esc(x.band.text)}</div>`
    const bq = clamp(2 * p - 1)
    // 자막 — 읽는 속도에 맞춰 읽은 글자부터 밝아진다
    const said = Math.round(b.say.length * clamp(U / DUR))
    const q = clamp((t - (total - TAIL)) / 0.4)
    return {
      title: { text: S.title, size: fit(S.title.replace(/ /g, ''), 960, 88, 56), opacity: clamp(t / FADE) }, // 한 줄에 들어가게 — 낱말이 아니라 제목 전체 폭으로
      band: prev && prev.band.text !== b.band.text && p < 1 ? band(prev, clamp(1 - 2 * p), -30 * clamp(2 * p)) + band(b, bq, 30 * (1 - bq)) : band(b, 1, 0),
      sub: { html: `${esc(b.say.slice(0, said))}<span class="rest">${esc(b.say.slice(said))}</span>`, opacity: clamp(U / 0.15) },
      end: q > 0 ? { opacity: q, html: `<b style="transform:scale(${0.9 + 0.1 * ease(q)})">My History</b><span>답은 기록의 면접 꼬리 질문에서</span>` +
        (S.follow?.length ? `<small>다음 편${S.follow.map(f => `<b>${esc(f.kind)} · ${esc(f.name)}</b>`).join('')}</small>` : '') } : null
    }
  }

  g.ShortsText = { FADE, TAIL, GAP, C, esc, clamp, ease, textW, fit, beatAt, layers }
})(typeof window !== 'undefined' ? window : globalThis)
