# ATS·키워드 (직무 공통)

ATS(지원자 관리 시스템)는 사람이 읽기 전에 이력서를 글자로 풀어 걸러 내는 프로그램이다. 한국 플랫폼(원티드·잡코리아 등)도 이력서를 칸으로 받아 검색·추천에 쓰므로 원리는 같다.

## 핵심 정리
- 표·그림·머리글 기호·여러 단을 피하고 글자를 고를 수 있는 PDF 로 낸다. Tech Interview Handbook: "Never add symbols to your headers"
- 키워드는 **공고의 자격요건·우대사항 단어를 그대로** 쓰되, 실제로 한 일에만 붙인다(채우기 금지)
- 약어는 처음 한 번 풀어 쓴다(예: Amazon Web Services(AWS))
- 기술은 기술 구역에만 두지 말고 **경력·프로젝트 줄 안에도** 나오게 한다 — 일부 ATS 는 기술이 나온 위치로 경력을 추정한다
- 한 직군에 넓게 지원할 때는 공고 여러 개를 모아 자주 나오는 단어를 센다(각 직무의 `job-posting-patterns.md`)

## PDF 글자 추출에서 본 것 (직접 실험, 2026-10-17)
- 한글 웹 글꼴(Google Fonts 의 한글 글꼴)은 글자 범위마다 조각 파일로 나뉜다. Chrome 으로 PDF 를 만들면 낱말 안에서 글꼴이 바뀌어, pypdf 같은 추출기가 '백 엔 드 개 발 자'처럼 글자 사이에 공백을 넣었다(pdftotext 는 괜찮았다). 한 파일짜리 시스템 글꼴(Apple SD Gothic Neo)로 찍으면 둘 다 바르게 읽혔다 — 추출기마다 다르니 **두 가지 이상으로 풀어 본다**
- 여백을 둔 칩(테두리 상자)들은 추출기가 세로 단으로 묶어 읽어, 다른 구역 글자가 칩 사이에 끼었다. 쉼표로 이은 한 줄 글자는 그대로 읽힌다
- 아이콘(SVG)의 이름은 글자로 남지 않는다 — 'GitHub:' 같은 이름은 글자로 둔다
- 나란한 칸 사이에 공백이 없으면 '예시회사2026.09'처럼 붙어 날짜를 못 읽을 수 있다

## 이 사이트에 적용
- 화면 이력서는 1단·표 없음이라 ATS 에 안전하다. 인쇄(PDF)에서는 시스템 한글 글꼴, 칩은 쉼표로 이은 글자, 연락처 이름은 글자로 바뀐다(site/DESIGN.md 인쇄)
- 직무 이력서의 `## 기술` 은 그 직무 공고에서 자주 나온 단어 순서로 둔다

## Sources (접속 2026-10-17)
- [Tech Interview Handbook — Resume](https://www.techinterviewhandbook.org/resume/)
- [resumegeni — LLM 엔지니어 이력서 가이드(서식이 ATS 를 방해하는 예)](https://resumegeni.com/ko/blog/llm-engineer-generative-ai-resume-guide)
- [BeamJobs — Front-End Developer Resume Samples](https://beamjobs.com/resumes/front-end-developer-resume-samples)
