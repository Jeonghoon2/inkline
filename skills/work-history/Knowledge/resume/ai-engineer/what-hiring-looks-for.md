# AI 엔지니어 — 채용이 보는 것

여기서 AI 엔지니어는 이미 만든 기반 모델(LLM)을 API·프롬프트·평가로 제품에 엮는 사람이다(Latent Space 의 정의: 모델 학습보다 제품화·평가). 모델을 직접 학습·서빙하는 ML 엔지니어와 겹치는 공고도 많다.

## 핵심 정리
- **실제 서비스에 LLM 을 넣은 경험**이 1순위. resumegeni 는 데모·래퍼 수준만 있는 이력서를 약점으로 꼽는다
- **RAG** 가 국내 공고의 가장 흔한 단어: 문서 청킹·벡터 DB·검색 + 생성(원티드 RAG 공고, 리멤버 Sr AI Engineer)
- **에이전트·워크플로**: LangChain·LangGraph 로 에이전트·워크플로 설계(리멤버 공고), 라우팅·다중 에이전트(검색 요약)
- **평가(eval)**: 단위 시험(단언) → 사람·모델 평가 → A/B 의 세 층, LLM 심판은 사람 판정과 일치도를 확인(Hamel Husain). 공고는 '평가 경험' 수준으로 자주 묻는다
- **비용·지연**: 여러 모델을 벤치마크해 비용 효율을 고른 경험(원티드 RAG 공고), 토큰·지연·비용 숫자(resumegeni)
- **LLMOps·서빙**: LLM Gateway·Workflow·Vector DB 플랫폼, vLLM·Triton 서빙, Kubernetes(토스 ML/LLM Ops) — ML 엔지니어 쪽 공고에서 강하다
- **파인튜닝**: LoRA·병합과 평가(워프스페이스 공고) — 일부 공고만
- 가드레일·방어적 UX·사용자 피드백 수집도 LLM 시스템 패턴(Eugene Yan)

## 하기 / 하지 않기
- 하기: 품질을 어떻게 쟀는지(평가 기준·케이스 수·통과율·감사 결과)를 성과 줄마다
- 하기: 프롬프트 주입·개인정보 유출을 막은 장치(실패 시 닫힘, 출력 검사)를 구체적으로
- 하기: 운영 배포 여부를 밝힌다 — 로컬·시험만 한 것은 그렇게 적는다
- 하지 않기: 'GPT API 연동' 같은 한 줄, 쓰지 않은 LangChain·벡터 DB 이름

## 키워드
LLM, 프롬프트 엔지니어링, 구조화 출력, 출력 검증(가드레일), LLM 평가(eval), LLM-as-judge, RAG, 임베딩, 벡터 DB, 에이전트, 워크플로, 생성-평가 반복(evaluator-optimizer), 프롬프트 주입 방어, 토큰·비용 최적화, 지연, 멀티 프로바이더(OpenAI·Anthropic·Google), 모델 서빙, 파인튜닝(LoRA), LLMOps, 관측(트레이스)

## Sources (접속 2026-10-17)
- [Latent Space — The Rise of the AI Engineer](https://www.latent.space/p/ai-engineer)
- [원티드 AI 엔지니어(RAG 시스템)](https://www.wanted.co.kr/wd/224265)
- [리멤버 Sr AI Engineer (LLM/RAG)](https://career.rememberapp.co.kr/job/posting/276000)
- [토스뱅크 ML Engineer (ML/LLM Ops)](https://toss.im/career/job-detail?job_id=5498959003)
- [원티드 워프스페이스 AI Engineer (LLM)](https://www.wanted.co.kr/wd/230817)
- [Hamel Husain — Your AI Product Needs Evals](https://hamel.dev/blog/posts/evals/)
- [Eugene Yan — Patterns for Building LLM-based Systems & Products](https://eugeneyan.com/writing/llm-patterns/)
- [resumegeni — LLM 엔지니어 이력서 가이드](https://resumegeni.com/ko/blog/llm-engineer-generative-ai-resume-guide)
