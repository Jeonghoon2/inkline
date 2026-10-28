---
name: concept-shorts
description: 개념 사전(concepts.md)과 형광펜 칠한 작업 기록의 개념을 60초 세로 쇼츠(대본 → 음성 → MP4)로 만든다. 만드는 코드(engine/)까지 이 폴더에 다 들어 있어 스킬만 받으면 같은 영상이 나온다. 기본 기록 폴더는 ~/My-History. "이 개념 쇼츠 만들어 줘", "60초 영상으로 설명해 줘", 쇼츠 대본 규칙·그림 부품을 고칠 때, 타임라인 페이지의 '▶ 60초 쇼츠'가 안 될 때 사용. 개념 사전·형광펜 자체를 쓰는 일은 work-history 스킬.
---

# 개념 쇼츠

개념 하나를 '60초 컴공' 채널식 쇼츠로 만든다. 문제 → 핵심 아이디어 → 작은 실제 예 → 반전 → 결과 카드 → **면접 꼬리 질문** 엔딩. 레퍼런스 분석은 `references/60초-컴공-분석.md`.

**이 폴더 하나로 끝난다** — 규칙(`script-rules.md`·`review-rules.md`·`schema.json`), 만드는 코드(`engine/`), 받아쓰기(`tools/`), 예시(`examples/`). 다른 사람에게는 이 폴더를 통째로 넘기면 된다(`engine/node_modules` 는 빼고 — setup.sh 가 다시 깐다)

## 처음 한 번 (설치)
- 필요한 것: **macOS**(음성을 `say` 로 만든다) · 한국어 음성 **Yuna** · **Node 22+**(HyperFrames 가 요구) · **ffmpeg** · **Google Chrome** · **Claude Code 를 claude.ai 구독으로 로그인**
- `sh ~/.claude/skills/concept-shorts/engine/setup.sh` — 위를 하나씩 확인하고(없으면 받는 법을 알려 준다) playwright·HyperFrames·Remotion(정확한 버전으로 고정, `engine/package.json`)을 깐 뒤 시험을 돌린다. `--whisper` 를 붙이면 품질 검사의 받아쓰기(faster-whisper)도 `~/.cache/concept-shorts/venv` 에 깐다 — **품질 검사를 통과시키려면 필요하다**(없으면 핵심어 검사를 건너뛰고 '아직 아님'). 녹화만 할 거면 없어도 된다
- 화면 글꼴은 맥 기본 글꼴(Apple SD Gothic Neo·SF Mono)만 쓴다 — 따로 받을 글꼴이 없고 맥이면 어디서나 같게 그려진다
- **Windows 10/11:** 음성은 `say` 대신 PowerShell 의 System.Speech 로 만든다(한국어 음성 **Microsoft Heami** — 설정 → 시간 및 언어 → 언어 및 지역 → 한국어 → 언어 옵션에서 음성 받기. 다른 음성은 `SHORTS_VOICE`, 말 속도는 `SHORTS_SAPI_RATE`(-10~10, 기본은 `SHORTS_RATE` 185 를 옮긴 1)). 준비물은 `winget install OpenJS.NodeJS.LTS` · `winget install Gyan.FFmpeg` · `winget install Google.Chrome` 뒤 터미널을 새로 열고 `node ~/.claude/skills/concept-shorts/engine/setup.mjs`(setup.sh 와 같은 확인·설치, `--whisper` 도 같다). 글꼴은 맑은 고딕·Consolas 로 그려져 맥과 화소까지 같지는 않다 — 같은 영상 비교는 같은 OS 끼리

## 똑같이 나오는지 확인
```sh
cp -R ~/.claude/skills/concept-shorts/examples "${TMPDIR:-/tmp}/shorts-ex"
node ~/.claude/skills/concept-shorts/engine/shorts.mjs "나눠 읽기(스트리밍)" --render --root "${TMPDIR:-/tmp}/shorts-ex"
```
- `examples/shorts/나눠_읽기(스트리밍).json` 은 품질 검사를 통과한 기준 대본(55.6초, 12박자)이다. `--render` 는 Claude 를 부르지 않아 **같은 대본 → 같은 영상**이 나온다(2026-10-28 빈 HOME 에서 setup 부터 두 번 만들어 소리 2,604묶음은 모두 같고, 화면은 한 구간에서 눈에 안 보이는 인코딩 차이(밝기 최대 7/255 · 몇 픽셀)만 났다)
- **새로 만들기는 매번 조금씩 다르다** — 대본을 Claude 가 쓰기 때문. 규칙·검토·품질 검사가 결을 같게 맞출 뿐 글자까지 같지는 않다. 같은 영상을 나누려면 대본 json 을 나눈다

## 기록 폴더 (입력 형식)
- 기록 폴더 = `--root <폴더>` > 환경 변수 `SHORTS_ROOT` > `~/My-History`. 결과는 그 폴더의 `shorts/` 에 쌓인다. 폴더에 `build.mjs` 가 있으면(My-History 의 진입 파일) 끝나고 돌려 페이지도 갱신한다
- `concepts.md` — `## 개념 이름` / 원리 문단 / `- Q: 질문` + `  A: 답` (예: `examples/concepts.md`)
- `<카테고리>/<YYYY-MM>.md` — `## YYYY-MM-DD` 아래 `### 종류 — 제목` 한 건씩. 개념이 나온 곳을 `==글자|개념 이름==` 으로 칠한다. 그 개념을 칠한 기록 전체가 대본의 사건·수치 출처다(트러블슈팅 기록이 가장 좋다, 예: `examples/ShopAPI/2026-10.md`). 형식의 원본은 work-history 스킬

## 절대 규칙 — API 를 쓰지 않는다
- 대본·검토·고치기는 **claude.ai 구독 로그인의 `claude -p` 로만** 부른다. API 키(ANTHROPIC_API_KEY·ANTHROPIC_AUTH_TOKEN), Bedrock·Vertex, Anthropic SDK 직접 호출을 쓰지 않는다(사용자 규칙, 2026-10-13)
- `engine/shorts.mjs` 가 지킨다: 자식 프로세스에서 API 관련 환경 변수를 지우고, `claude auth status` 가 claude.ai·firstParty 가 아니면 멈춘다. 이 막는 코드를 빼지 않는다
- 로그의 금액(`정가 환산 $…`)은 API 정가로 어림한 값이지 청구액이 아니다. 실제로 드는 것은 구독 사용량

## 만드는 법
- **페이지에서(My-History):** `node ~/My-History/serve.mjs` → `http://localhost:4173` → 기록 상세 창 '면접 꼬리 질문'의 개념 옆 **▶ 60초 쇼츠** → **쇼츠 만들기**. 누를 때만 만든다(1편 10~15분 — 대본·검토·고치기 호출 5~8번)
- **대화에서:** `node ~/.claude/skills/concept-shorts/engine/shorts.mjs "<개념 이름>" --root ~/My-History` (개념 이름은 concepts.md 의 `## 이름` 그대로. 아래 명령도 모두 `--root` 를 받는다)
- **대본만 손봤을 때:** `shorts/<이름>.json` 을 고치고 `… shorts.mjs "<개념 이름>" --render` (Claude 를 부르지 않는다)
- **녹화만 실패했을 때:** `--from-draft` — 대본은 녹화 전에 `shorts/<이름>.draft.json` 으로 저장된다. 다시 쓰지 않고 영상만 만든다
- **손으로 고친 대본을 다시 검토:** `--review` — 검토 지적을 `meta.json` 에 갈아 끼운다(품질 검사가 읽는다). `--render` 는 기존 지적을 남긴다
- 결과: `<기록 폴더>/shorts/<이름>.mp4`(1080×1920, H.264+AAC)·`.json`(대본)·`.meta.json`(박자 시각·검토 지적)·`.log`(단계별 기록, 실패 이유)

## 흐름 (engine/shorts.mjs)
1. **대본** — `claude -p`(구독) 에 `script-rules.md`(시스템 프롬프트)와 `schema.json`(--json-schema)을 넘기고, 사전의 그 개념 블록 + **그 개념을 칠한 기록 전체**(상황·문제·해결 과정·고민, 트러블슈팅 먼저, 3,500자까지 — `engine/concepts.mjs` 의 `conceptEntries`)를 준다. 도구·MCP 는 끈다. 규칙의 핵심은 '사건 하나로 이야기, 질문으로 시작, 박자마다 잇는 말, 왜?를 묻고 답하기, 실제 예는 한 걸음씩'
2. **검사 → 검토 → 고쳐 끼우기** — 모양 검사(`validateScript`: 박자 순서·개수, 대사 48자·합 370자(속도 185 에서 60초), 새 대본은 분량 330자 이상·박자 9개 이상·'왜?' 질문·큰 글자만 있는 박자. 잇는 말은 세지 않는다 — 검토자와 부딪혔다)에 걸리면 **걸린 박자만** 고쳐 끼운다(최대 2번). 통과하면 검토자(`review-rules.md`)가 사실·흐름·그림·발음을 보고 무게(높음/보통)를 매긴다. 1·2차 검토는 지적이 있으면(보통 포함) 그 박자를 고쳐 끼우고, 3차는 결과만 `meta.json` 에 남긴다. 고친 대본이 모양 검사에 걸리면 고치기 전 대본을 둔다. 대본을 통째로 다시 쓰지 않는다 — 매번 새 문제가 생겨 수렴하지 않았고 비용도 3~5배였다(2026-10-13)
3. **음성** — 박자마다 `say -v Yuna -r 185`(`speak` 가 있으면 그걸 읽음). 단위·기호는 `speakable()` 이 풀어 읽는다(MB → 메가바이트, O(N) → 빅오 엔, id → 아이디, DB → 디비, S3 → 에스쓰리 — 'O(N)'을 '오 엔'으로 읽혔을 때 받아쓰기에 '5N'으로 들렸다). 길이를 재 박자 시각을 정하고 `shorts/<이름>.meta.json` 에 남긴다. 60초를 넘으면 검토까지 마친 대본의 대사만 줄여 끼운다(최대 2번, 다시 쓰지 않는다)
4. **녹화** — 그림은 **HyperFrames**, 조립은 **Remotion**(2026-10-14 사용자가 정함, 1편 약 3분)
   - **그림 장면(HyperFrames 0.8.153):** `player.html` 에서 제목·자막 칸만 숨기고(`sceneHTML`) 그림 칸 1080×920 만 찍는다. HyperFrames 가 프레임마다 보내는 `hf-seek` 이벤트를 `__seek(t)` 에 잇고, 길이는 빈 GSAP 타임라인으로 알린다 — 그림 코드는 하나라 품질 검사가 재는 그림과 같다
   - **조립(Remotion 4.0.535):** `engine/remotion/index.jsx` 가 그림 장면 위(위 420px)에 제목·요점 띠·자막·로고·끝 화면을 얹고 음성을 붙인다. 글자 층의 계산·모양은 `overlay.js`·`overlay.css` 를 player.html 과 같이 쓴다
   - **같은 대본 → 같은 영상이 되게 고정한 것:** 장면은 소프트웨어로 그리고(`--no-browser-gpu` — 하드웨어 GPU 로 그리면 다시 찍을 때마다 프레임이 미세하게 달랐다) 일꾼 6개, 빠른 찍기 실험은 끈다(`--no-experimental-fast-capture`, `HF_DE_PARALLEL_ROUTER=false` — HyperFrames 는 `~/.hyperframes/config.json` 의 실험군 값에 따라 찍는 방식을 바꿔, 빈 HOME 에서 다시 만들면 화소가 달랐다)
   - Chrome 은 둘 다 맥에 깔린 것. HyperFrames 의 사용 통계·스킬 자동 설치는 끈다(`DO_NOT_TRACK=1`, `HYPERFRAMES_SKIP_SKILLS=1` — `hyperframes init` 이 `~/.claude/skills` 에 스킬 10개를 깔았다). 엔진 밖에서 `npx hyperframes init` 을 돌리지 않는다
   - **라이선스:** Remotion 은 개인·3명 이하 회사·비영리만 무료다. 회사 업무에 쓰면 Remotion 회사 라이선스가 필요하다. HyperFrames 는 Apache-2.0
   - 예전 방식(`player.html` 을 Playwright 로 바로 찍기, 1편 약 1분 반)은 `SHORTS_RENDERER=classic` 으로 남겨 둔다
- 새 파일은 임시로 만들고 다 된 뒤에만 바꿔 끼운다 — 실패해도 이전 영상이 남는다

## 화면 모양 (engine/player.html · overlay.js · overlay.css)
- 1080×1920 검은 바탕, 컷 전환 없이 한 화면에서 바뀐다(레퍼런스 '60초 컴공'). 타임라인 페이지의 종이 바탕(work-history 스킬의 `site/DESIGN.md`)과 **일부러 다르다** — 세로 영상은 검은 바탕이 화면에서 덜 튀고, 상세 창의 쇼츠 띠도 검은 면으로 맞춰 둔다. 페이지 색을 바꿔도 쇼츠는 따라 바꾸지 않는다
- 3단 고정: 위 제목(88) + 요점 띠(46, bad 빨강 · key 노랑 · good 초록) / 가운데 그림(높이 920) / 아래 자막(58, 두 줄) / 왼쪽 아래 'My History · 60초 개념'
- 그림 색: 한 대상 = 한 색(c1 파랑 · c2 초록 · c3 주황 · c4 분홍), 보는 곳 key, 버린 것 dim. 박자 사이 0.45초 동안 같은 id 끼리 바뀐다(색도 섞어 넘긴다)
- 박자가 바뀔 때 앞 박자에만 있던 그림은 0.3초 동안 흐려지며 겹쳐 사라진다(`#draw-prev`) — 바로 지우면 새 그림이 0에서 나오기 전 그림 칸이 잠깐 비었다
- 녹화 중 화면 찍기가 가끔 30초씩 멈춘다 — 페이지를 새로 열어 그 프레임부터 이어 찍는다(최대 3번)
- 움직임(대본 형식과 상관없이 재생기가 붙인다): 한 박자에 새로 더한 항목·상자·칸·코드 줄은 대사 길이의 75% 안에서 **차례로** 나온다(`appear(k, n)`) · 화살표는 그려진다 · 숫자는 앞 값에서(처음이면 0에서) 세어 바뀐다 · 전후 카드는 같은 단위면 길이 비례 막대 · 새로 강조된 칸·상자는 한 번 빛난다 · 한계를 넘은 막대는 흔들린다 · 코드 새 줄은 타자 치듯 · 띠는 위로 밀려 바뀐다 · 그림 칸은 박자마다 2.5% 천천히 다가간다 · 자막은 읽은 글자부터 밝아진다(박자별 음성 길이를 `load(…, durs)` 로 받는다)
- 글자 수 제한(schema.json)이 곧 레이아웃 한계다 — 넘치면 잘리므로 칸을 늘리기 전에 제한부터 본다. 한글이 든 글자에는 고정폭 글꼴을 쓰지 않는다(코드 부품 `code` 만 예외, 코드는 영문)
- **글자 맞춤(자동):** 제목·띠·상자 이름·카드 값·칸 글자는 가장 긴 낱말이 칸에 들어가게 글자를 줄이고(`fit`), 그래도 길면 낱말 중간에서 줄을 바꾼다. 휴대폰 10pt(1080 폭의 30px) 아래로는 줄이지 않는다. 흐름 상자는 남은 폭을 나눠 갖고 화살표 칸은 제 글자만큼(80~180px) 넓어진다 — 고정 100px 칸에서 화살표 글자가 상자 테두리 위로 넘쳤다(2026-10-13)
- 모양을 고친 뒤에는 ① `node --test layout.test.mjs`(규칙 한계 길이의 글자로 부품마다 그려 넘침·겹침 0) ② 기존 쇼츠 모두 `shorts-qa.mjs "<이름>" --layout` ③ `--render` 로 다시 만들고 장면 모음(아래 '확인')을 직접 본다

## 고칠 곳
- 대본 말투·박자·길이 → `script-rules.md` (서버·대화 모두 이 파일 하나를 쓴다)
- 대본 모양(부품 칸·길이 제한) → `schema.json` + `engine/shorts.mjs` 의 `validateScript` + `engine/shorts.test.mjs`
- 제목·요점 띠·자막·끝 화면 → `engine/overlay.js`(계산)·`engine/overlay.css`(모양) — player.html 과 Remotion 조립이 같이 쓴다. 조립 순서·음성 → `engine/remotion/index.jsx`
- 그림 모양·새 부품 → `engine/player.html` 의 `PARTS` (부품: big·gauge·cells·flow·compare·code·list). 새 부품은 schema·rules·validate 에도 같이 넣는다
- 음성·모델: 환경 변수 `SHORTS_VOICE`(기본 Yuna), `SHORTS_RATE`(기본 185), `SHORTS_MODEL`(비우면 Claude Code 기본). 로그의 정가 환산(기본 모델, 구독 사용량이지 청구액 아님): 처음 쓰기 $0.2~0.6 · 검토 $0.16 · 고쳐 끼우기 한 번 $0.1~0.2 — 1편 대략 $0.5~1.0
- My-History 페이지 버튼 → work-history 스킬의 `site/src/scripts/shorts.js`·`site/src/styles/shorts.css`, 서버 → `site/serve.mjs`(같은 skills 폴더의 이 엔진을 가져다 쓴다, `~/My-History/serve.mjs` 는 진입 파일)

## 품질 검사 (engine/shorts-qa.mjs)
- `node ~/.claude/skills/concept-shorts/engine/shorts-qa.mjs "<개념 이름>" --root ~/My-History` → `shorts/<이름>.qa.json`. 기준을 모두 넘으면 종료 코드 0
- 기준: 길이 50~60초 · 말 속도 초당 5.9자 이하(실제로 읽는 글자 `speak`·단위 풀어 읽기 기준, 공백 제외, 레퍼런스 4.9~5.8 — 자막 글자로 재면 영어가 많은 대본이 부풀었다) · 큰 글자만 있는 박자 2개 이하 · 화면 넘침·겹침 0(박자마다 말이 끝나는 순간을 그려 글자 하나하나의 줄 상자로 잰다: 그림 칸 밖 · 상자 안 글자가 테두리에서 12px 안쪽(칸은 4px)에 있는지 · 상자 밖 글자가 다른 상자에 걸치는지 · 글자끼리 겹침 · 30px 보다 작은 글자 · 제목 두 줄·띠 덮음 · 자막 3줄 · 띠 넘침. 칸 밖만 보던 검사는 화살표 글자가 상자 테두리에 걸친 것을 놓쳤다) · 검토 '높음' 0 · 핵심어(숫자+단위·영어 용어) 들림 90% 이상
- 받아쓰기: `setup.sh --whisper` 로 깐 python(또는 `SHORTS_WHISPER_PY`)이 있어야 한다 — 없으면 핵심어 검사를 건너뛰고 결과는 '아직 아님'(통과로 치지 않는다)(`tools/transcribe.py`, small 모델 — 처음 한 번 받는다). 받아쓰기는 '메가바이트'를 'MB'로, '디비'를 'db'로 되돌려 쓰니 비교 전에 같은 꼴로 맞춘다. 전체 글자 오차는 받아쓰기 모델의 철자 실수(읽기 → 일기)가 섞여 참고로만. `speak` 로 한글 발음을 준 영어(SIGKILL → 시그킬)는 받아쓰기도 한글로 써서 핵심어에서 뺀다 — 넣으면 늘 '안 들림'이 됐다(2026-10-13, Terraform 40%가 실제로는 다 들렸다)
- **끝 기준:** 품질 검사 통과 + 검토 '높음' 0 + 장면 모음을 직접 봐서 어긋남 없음. 검토자는 돌릴 때마다 다른 '보통' 지적을 2~4건씩 찾아낸다 — '보통 0'은 목표가 아니다. 숫자 한두 개로 고칠 수 있는 보통 지적은 대본 json 을 직접 고쳐 `--render` → `--review` 로 확인한다
- 기준 통과가 끝이 아니다: '보통' 지적과 대사를 직접 읽어 본다. 2026-10-13 '나눠 읽기'는 기준은 통과했지만 '질문 전에 필요한 사실', '결정은 해결보다 먼저' 같은 흐름 문제가 '보통'으로 남았다

## 확인
- `cd ~/.claude/skills/concept-shorts/engine && node --test shorts.test.mjs layout.test.mjs` — 대본 검사기와 그림 한계(맥의 Chrome 필요)
- 화면 넘침·겹침만 빠르게(녹화·받아쓰기 없이 몇 초): `node shorts-qa.mjs "<개념 이름>" --layout`
- 만든 영상은 장면을 뽑아 직접 본다: `ffmpeg -i shorts/<이름>.mp4 -vf "fps=1/2,scale=270:-2,tile=6x5" -frames:v 1 "${TMPDIR:-/tmp}/sheet.png"` — 글자 잘림·겹침, 띠와 대사가 같은 말인지, 수치가 기록과 맞는지
- 사실 확인: 대본의 수치·주장이 사전과 기록에 있는 것인지 본다. 없는 주장이 있으면 json 을 고쳐 `--render`

## 후속 영상(다음 편)
60초에 다 못 담는 것은 다음 편으로 잇는다(사용자가 2026-10-14 정함).
- **누가:** 대본을 쓰는 Claude 가 `follow`(0~2개)로 낸다 — **선행**(모르면 이 영상을 이해하기 어려운 개념, 예: Spring → Java) · **심화**(이 영상에서 잘라 낸 깊은 내용). 규칙은 `script-rules.md` '후속 영상'
- **언제:** 원래 영상이 끝나면 **이어서 자동으로** 만든다. 서버(페이지)에서는 편마다 따로 작업 줄에 서서 페이지가 진행을 보여 준다. 이미 만든 편은 건너뛴다. **후속의 후속은 만들지 않는다**(한 단계 — 끝없이 이어지지 않게). 대본 그대로 다시 녹화(`--render`)할 때는 만들지 않는다
- **사전:** 후속 개념이 concepts.md 에 없으면 Claude 가 항목(원리 한 문단 + 꼬리 질문 3개, `concept-rules.md`)을 써서 사전 끝에 붙인다. 이름 아래 `<!-- 후속: 선행 · <원래 개념> 쇼츠에서 — <이유> -->` 한 줄이 붙고, 사전 읽기(`concepts.mjs`)가 이것을 `from` 으로 읽는다
- **화면:** 영상 끝 화면에 '다음 편 · 선행 · Java'. 페이지는 쇼츠 띠와 꼬리 질문의 플레이어 아래에 '다음 편'(후속 편 영상이 있으면 그 자리에서 바꿔 재생)·'이전 편'(후속 편을 볼 때) 단추를 둔다
- **사용량:** 한 편을 만들면 후속까지 최대 3편 + 사전 항목 2개만큼 Claude 를 부른다. 후속 실패는 원래 영상에 영향이 없다(`.log` 에 남는다)

## 하지 않는 것
- 배경음악, 업로드. 쇼츠 자동 일괄 생성(사전 전체를 한꺼번에) — 자동으로 만드는 것은 위 후속 편(한 단계, 2개까지)뿐. 서버는 127.0.0.1 에서만, 같은 페이지(Origin)의 요청만 받는다
