# AI 엔지니어 (LLM 애플리케이션 · RAG · 에이전트) — 채용 쪽 근거 (조사 2026-10-27 · Inkline 이 웹 검색으로 모음)

## 요점 — 이 직무 이력서는 이렇게 쓴다
- LLM을 실제 서비스에 붙여 운영해 본 경험이 있는지 먼저 봅니다. 토스뱅크·SK온·로앤컴퍼니 공고는 모두 실서비스나 end-to-end 적용 경험을 요구합니다.
- RAG를 직접 설계했는지 봅니다. 데이터 수집, 청킹, 임베딩, Vector DB, 재순위(rerank)까지 어느 단계를 맡았는지가 드러나야 합니다.
- 품질을 어떻게 쟀는지 봅니다. 평가 데이터셋, LLM-as-a-Judge, 오프라인 지표와 A/B 테스트가 토스와 스텝하우 공고에 직접 나옵니다.
- 품질·지연·비용 사이에서 어떻게 판단했는지 봅니다. 토스 공고의 이력서 안내와 자산운용사 공고 주요업무에 이 세 가지가 함께 나옵니다.
- 무엇을 했는지보다 왜 그렇게 골랐는지를 봅니다. 기술을 고른 근거와 제약 조건을 말할 수 있어야 합니다.
- LangChain·LangGraph·LlamaIndex 같은 에이전트·RAG 프레임워크 경험이 있는지 봅니다. 많은 공고가 이를 자격요건이나 우대사항에 넣습니다.
- Python 서비스 개발, REST API, Docker·Kubernetes, 클라우드 같은 소프트웨어 엔지니어링 기본기를 봅니다. 백엔드 경력 3년 이상도 지원 자격으로 인정됩니다.
- 해결하려던 문제, 본인 역할, 데이터 규모, 서비스 환경을 구체적으로 썼는지 봅니다. 토스 Growth 공고가 이력서 안내에서 그대로 요구하는 항목입니다.
- 기대와 다른 결과가 나왔을 때 원인을 찾아 고친 과정이나 운영 중 트러블슈팅 경험이 있는지 봅니다. 토스와 토스뱅크가 따로 강조합니다.

## 출처
1. 토스 ML Engineer (검색 Relevance) 채용 공고 — https://toss.im/career/job-detail?job_id=7992223003 · 공고 · 열어 봄(앱 확인)
   - 자격요건(LLM을 레이블링·평가 도구로 활용, 근본 원인 분석), 우대사항(LLM-as-a-Judge, ANN, BM25), 채용 절차(프리 인터뷰·ML 시스템 설계)
2. 토스 ML Engineer (Growth) 채용 공고 — https://toss.im/career/job-detail?job_id=8038772003 · 공고 · 열어 봄(앱 확인)
   - 이력서 작성 안내(문제·역할·데이터 규모·근거·오프라인/온라인 성과·품질/속도/비용 판단), 비개발 직군에게 설명하는 역량
3. 토스뱅크 ML Engineer (ML/LLM Ops) 채용 공고 — https://toss.im/career/job-detail?gh_jid=5498959003 · 공고 · 열어 봄(앱 확인)
   - Kubernetes 필수, vLLM·SGLang·Triton·LLM Gateway·Vector DB 우대, 라이브 코딩 테스트 포함 절차
4. [토스뱅크] ML Engineer (LLM) — 리멤버 — https://career.rememberapp.co.kr/job/posting/265856 · 공고 · 열어 봄(앱 확인)
   - 경력 3~15년, LLM 서빙·LLMOps·파인튜닝, 임팩트 프로젝트와 수치 성과 기술 요청. 읽은 시점에 마감 공고로 표시됨
5. [헤드헌팅] 대형금융지주사 계열 자산운용사 AI 엔지니어 — 리멤버 — https://career.rememberapp.co.kr/job/posting/308932 · 공고 · 열어 봄(앱 확인)
   - 경력 3년 이상, Python·REST API 자격요건, RAG 파이프라인·여러 LLM 비교·지연/비용 최적화 업무, LangGraph·Vector DB 우대
6. [헤드헌팅] 국내 3대 엔터사 AI Artist LLM Engineer — 리멤버 — https://career.rememberapp.co.kr/job/posting/298551 · 공고 · 열어 봄(앱 확인)
   - LLM API·프롬프트, RAG, 저지연 실시간 서비스 자격요건, 추론 최적화·파인튜닝·MLOps 우대. 경력 5~10년
7. [헤드헌팅] AI 개발 전문기업 AI Engineer — 리멤버 — https://career.rememberapp.co.kr/job/posting/275768 · 공고 · 열어 봄(앱 확인)
   - 10~15년차 리더 공고. LangChain/LangGraph, 에이전트, Langfuse 등. 주니어가 지원할 대상은 아니고 요건 경향을 참고하는 용도
8. 로앤컴퍼니 AI Engineer 채용 — https://lawcompany.career.greetinghr.com/ko/o/165289 · 공고 · 열어 봄(앱 확인)
   - RAG 성능 병목 분석, end-to-end 실서비스 적용, 할루시네이션 최소화, Multi-Agent·VectorDB 우대. 변호사 실무 경력 요구라는 특수 조건
9. SK온 생성형 AI(GenAI) 개발 담당자 채용 — https://www.skcareers.com/Recruit/Detail/R252250 · 공고 · 열어 봄(앱 확인)
   - 생성형 AI 서비스 실무 3년 이상, GenAI API·오픈소스 모델 배포 운영, LangChain, 대규모 실서비스 경험 우대
10. [스텝하우] AI 데이터 엔지니어 (RAG/LLM 서비스 개발) — https://zighang.com/recruitment/8602000e-9e14-4c70-abdb-355e7efa68c3 · 공고 · 열어 봄(앱 확인)
   - 2025-08-19 게시, 마감 표시. 모델 선택·프롬프팅·평가 자격요건, 재순위·평가 체계·평가 지표 설계 우대
11. AI 시대 개발자 채용 현황 분석: 필수 역량과 특징 (스파르타 브런치) — https://brunch.co.kr/@sparta/146 · 블로그 · 열어 봄(앱 확인)
   - 교육기관 글이라 2차 자료. 공고 필수 역량(LLM API, RAG, LLMOps, 에이전트, PyTorch)과 '왜 그렇게 만들었나'·핵심 스택 3~4개를 깊게 쓰라는 조언
12. The AI Engineering Stack (Pragmatic Engineer, Chip Huyen 책 발췌) — https://newsletter.pragmaticengineer.com/p/the-ai-engineering-stack · 블로그 · 열어 봄(앱 확인)
   - AI 엔지니어와 ML 엔지니어의 차이(모델 적응·평가 중심), 소프트웨어·풀스택 엔지니어가 넘어오는 경로, 앱·모델·인프라 3계층 스택
13. PwC 코리아 AI Engineer 채용 — https://www.pwc.com/kr/ko/career/experienced/r260519.html · 공고 · 열리지 않음
   - 검색 요약: LLM 앱·Agent 실무 2년 이상(총경력 3년 이상), RAG 평가(Faithfulness 등), RAGAS·DeepEval·MCP 우대. 페이지는 403으로 열지 못함
14. 잡플래닛 AI 직무 이력서·포트폴리오 기사 — https://www.jobplanet.co.kr/contents/news-8460 · 기사 · 열어 봄(앱 확인)
   - 검색 요약: 문제→역할→기술 선택 이유→성과 순서, 수치가 없으면 실사용 여부로 대체, 상세 내용은 포트폴리오로. 본문은 403으로 열지 못함
15. Backoffice AI Agent 구축기 — RAG+MCP 기반 플레이스AI 지식 검색 (네이버 플레이스 개발 블로그) — https://medium.com/naver-place-dev/backoffice-ai-agent-%EA%B5%AC%EC%B6%95%EA%B8%B0-rag-mcp-%EA%B8%B0%EB%B0%98-%ED%94%8C%EB%A0%88%EC%9D%B4%EC%8A%A4ai-%ED%8A%B9%ED%99%94-%EC%A7%80%EC%8B%9D-%EA%B2%80%EC%83%89-%EC%8B%9C%EC%8A%A4%ED%85%9C-9a66b4afa1aa · 채용 쪽 · 열어 봄(앱 확인)
   - 검색 요약: 정답지가 없는 사내 문서에서 LLM 평가자로 검색 연관성을 수치화, BEIR Recall@K 병행, 검색 반복 호출 에이전트. 본문은 403으로 열지 못함
16. LLM·생성형 AI 엔지니어 면접에서 LoRA·QLoRA 어필하는 8가지 — https://prime-career.com/interview_article/10824 · 블로그 · 열어 봄(앱 확인)
   - 검색 요약: 면접관은 기법 사용 여부보다 제약 안에서 내린 선택의 근거와 데이터·비용·평가·배포의 연결을 본다는 주장
