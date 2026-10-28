# AI 엔지니어 (LLM 애플리케이션 · RAG · 에이전트) — 경험 점검표 (조사 2026-10-27 · Inkline 이 웹 검색으로 모음)

| 항목 | 증거 키워드 | 근거 |
| --- | --- | --- |
| LLM 기능 실서비스 배포·운영 | 배포, 운영, 프로덕션, 사용자 수, 트래픽, 릴리스, OpenAI/Claude API | 로앤컴퍼니(end-to-end 실서비스 적용), SK온(실서비스화), 토스뱅크 LLM 애플리케이션 개발 |
| RAG 파이프라인 구축 | 청킹, 임베딩, 인덱싱, 벡터DB, Qdrant, Milvus, FAISS, pgvector, retriever | 자산운용사(리멤버) 주요업무, 엔터사 자격요건, 로앤컴퍼니 자격요건 |
| 검색 품질 개선(하이브리드·재순위) | BM25, Elasticsearch, OpenSearch, rerank, Recall@K, hybrid search | 토스 검색 Relevance 우대사항, 스텝하우 우대사항(검색 재순위) |
| LLM 평가 체계 구축 | 평가셋, eval, LLM-as-a-Judge, RAGAS, DeepEval, faithfulness, 회귀 테스트 | 토스 검색 Relevance, 스텝하우 우대사항, PwC 공고(검색 요약), Chip Huyen의 평가 강조 |
| 에이전트·워크플로 설계 | LangGraph, LangChain, tool calling, 라우팅, 멀티에이전트, MCP | 자산운용사 주요업무, 로앤컴퍼니 우대사항, 스파르타 분석(에이전트 요구 증가) |
| 지연·비용 최적화 | p95, latency, 토큰 비용, 캐시, 스트리밍, 모델 라우팅, 비동기 | 자산운용사(지연·비용·품질 최적화), 엔터사(저지연, 비용 효율화), 토스 이력서 안내 |
| 여러 LLM 비교 실험 | 모델 비교, Qwen, Gemini, A/B, 실험 로그, 벤치마크 | 자산운용사 주요업무(여러 LLM 비교·로그 기반 실험), 토스 Growth(A/B 테스트) |
| 할루시네이션 줄이기 | 환각, groundedness, 근거 인용, 가드레일, 프롬프트 개선 | 로앤컴퍼니 주요업무(법률 할루시네이션 최소화), 엔터사(품질 평가 체계) |
| LLM 서빙·LLMOps | vLLM, SGLang, Triton, GPU, LLM Gateway, Langfuse, 모니터링 | 토스뱅크 ML Engineer(LLM), 토스뱅크 ML Platform 우대사항 |
| 파인튜닝·데이터셋 제작 | LoRA, QLoRA, SFT, 학습 데이터, 레이블링, distillation | 엔터사·토스뱅크 우대사항, 토스 검색 Relevance(LLM 레이블링·증류) |
| 컨테이너·클라우드 운영 | Docker, Kubernetes, EKS, GKE, AWS Bedrock, CI/CD, Terraform | 토스뱅크 ML Platform(K8s 필수), 스텝하우, 로앤컴퍼니, 자산운용사 |
| 데이터 파이프라인 | ETL, 전처리, Airflow, 배치, 문서 파싱, Kafka, SQS | 스텝하우 자격요건, 자산운용사(데이터 수집~전처리 파이프라인) |
| 운영 중 트러블슈팅 | 장애, 원인 분석, 포스트모템, 로그, 롤백, 품질 저하 | 토스뱅크 LLM 공고 우대사항, 토스 검색 Relevance 자격요건 |
| 지표 정의와 비개발 직군 설명 | 성공 지표, KPI, 기획자 협의, 보고, 도메인 전문가, 사람 검수 | 토스 Growth 자격요건, 고객사 협업(브리스캔 헤드헌팅 공고) |
