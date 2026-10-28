#!/bin/sh
# 개념 쇼츠 — 처음 한 번. 필요한 것을 확인하고 playwright 를 설치한다
#   sh setup.sh            확인 + npm install
#   sh setup.sh --whisper  품질 검사의 받아쓰기(faster-whisper)까지 ~/.cache/concept-shorts/venv 에 설치
cd "$(dirname "$0")" || exit 1
fail=0
ok() { printf '  ✓ %s\n' "$1"; }
no() { printf '  ✗ %s — %s\n' "$1" "$2"; fail=1; }

[ "$(uname)" = Darwin ] && ok macOS || no macOS '음성을 macOS 의 say 로 만든다(다른 OS 는 안 된다)'
say -v '?' 2>/dev/null | grep -q '^Yuna ' && ok '음성 Yuna' || no '음성 Yuna' '시스템 설정 → 손쉬운 사용 → 읽기 및 말하기 → 시스템 음성 → 음성 관리에서 한국어 Yuna 받기'
command -v node >/dev/null && node -e 'process.exit(+process.versions.node.split(".")[0] >= 22 ? 0 : 1)' && ok "node $(node -v)" || no node 'brew install node (22 이상 — HyperFrames 가 요구)'
command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null && ok ffmpeg || no ffmpeg 'brew install ffmpeg'
[ -d '/Applications/Google Chrome.app' ] && ok Chrome || no Chrome '녹화·품질 검사에 맥에 깔린 Chrome 을 쓴다'
# API 는 쓰지 않는다 — claude.ai 구독 로그인만 받는다(shorts.mjs 도 매번 다시 확인한다)
if command -v claude >/dev/null && claude auth status 2>/dev/null | node -e 'const s=JSON.parse(require("fs").readFileSync(0,"utf8"));process.exit(s.loggedIn&&s.authMethod==="claude.ai"&&s.apiProvider==="firstParty"?0:1)'; then
  ok 'Claude Code — claude.ai 구독 로그인'
else
  # 새 대본을 쓸 때만 필요하다 — 받은 대본으로 녹화(--render)·품질 검사는 로그인 없이 된다
  printf '  ! %s — %s\n' 'Claude Code — claude.ai 구독 로그인 없음' '새 대본을 쓰려면 Claude Code 를 깔고 `claude` 에서 /login 으로 구독 계정 로그인(API 키·Bedrock·Vertex 는 쓰지 않는다). 받은 대본 녹화는 그대로 된다'
fi
[ "$fail" = 0 ] || { echo '위 ✗ 를 해결하고 다시 돌린다'; exit 1; }

# HyperFrames 는 설치·실행 때 사용 통계를 보내고 AI 스킬을 깔려 한다 — 둘 다 끈다
DO_NOT_TRACK=1 HYPERFRAMES_SKIP_SKILLS=1 npm install --no-audit --no-fund --silent && ok 'playwright·HyperFrames·Remotion (npm install)' || exit 1
if [ "$1" = --whisper ]; then
  V="$HOME/.cache/concept-shorts/venv"
  { [ -x "$V/bin/python" ] || python3 -m venv "$V"; } && "$V/bin/pip" install -q faster-whisper && ok "faster-whisper ($V)" || exit 1
fi
node --test shorts.test.mjs layout.test.mjs >/dev/null 2>&1 && ok '대본 검사기·그림 한계 시험' || { echo '시험 실패 — node --test shorts.test.mjs layout.test.mjs'; exit 1; }
[ -x "$HOME/.cache/concept-shorts/venv/bin/python" ] || [ -n "$SHORTS_WHISPER_PY" ] || printf '  ! %s — %s\n' '받아쓰기 없음' '녹화는 되지만 품질 검사는 핵심어를 못 재 "아직 아님"으로 끝난다. sh setup.sh --whisper'
echo '준비 끝 — SKILL.md 의 "똑같이 나오는지 확인" 부터'
