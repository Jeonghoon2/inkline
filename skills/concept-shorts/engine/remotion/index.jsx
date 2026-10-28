// Remotion 조립 — HyperFrames 가 그린 그림 장면(scene.mp4) 위에 제목·요점 띠·자막·끝 화면을 얹고 음성을 붙여 최종 영상을 만든다
// 글자 층의 계산과 모양은 ../overlay.js·../overlay.css 를 그대로 쓴다 — 품질 검사(player.html)가 잰 배치와 같게
// 넘겨받는 것(inputProps): script(대본), starts·durs·total(박자 시각, 초). 파일은 bundle 의 publicDir 에 scene.mp4·voice.wav
import React from 'react'
import { AbsoluteFill, Audio, Composition, OffthreadVideo, registerRoot, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import '../overlay.css'
import '../overlay.js'

const FPS = 30
const T = globalThis.ShortsText

function Short({ script, starts, durs, total }) {
  const frame = useCurrentFrame(), { fps } = useVideoConfig()
  const L = T.layers(script, starts, durs, total, frame / fps)
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <div id="stage">
        {/* 그림 칸 — player.html 의 #draw 자리(위 420px, 1080×920) */}
        <OffthreadVideo src={staticFile('scene.mp4')} muted style={{ position: 'absolute', top: 420, left: 0, width: 1080, height: 920 }} />
        <div id="title" style={{ fontSize: L.title.size, opacity: L.title.opacity }}>{L.title.text}</div>
        <div id="band" dangerouslySetInnerHTML={{ __html: L.band }} />
        <div id="sub" style={{ opacity: L.sub.opacity }} dangerouslySetInnerHTML={{ __html: L.sub.html }} />
        <div id="brand">My History · 60초 개념</div>
        {L.end && <div id="end" style={{ opacity: L.end.opacity }} dangerouslySetInnerHTML={{ __html: L.end.html }} />}
      </div>
      <Audio src={staticFile('voice.wav')} />
    </AbsoluteFill>
  )
}

registerRoot(() => (
  <Composition id="Short" component={Short} fps={FPS} width={1080} height={1920} durationInFrames={1}
    defaultProps={{ script: { title: '', beats: [{ say: '', band: { text: '', tone: 'key' }, draw: [] }] }, starts: [0], durs: [1], total: 1 }}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.ceil(props.total * FPS) })} />
))
