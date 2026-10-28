# 데이터 엔지니어 — 채용이 보는 것

## 핵심 정리
- **파이프라인을 설계부터 운영까지** 맡은 경험(에이블리 '설계부터 운영까지 주도', 베이글코드 '설계·구축·운영')
- **분산 처리·실시간**: Spark·Kafka·Flink 가 자격요건 또는 우대에 거의 늘 나온다(요기요·에이블리·베이글코드·카카오뱅크·네이버제트 검색 요약)
- **오케스트레이션·변환**: Airflow·dbt(요기요 자격요건, 베이글코드 우대)
- **클라우드·컨테이너·IaC**: AWS/GCP 데이터 인프라 운영, Kubernetes, Terraform(베이글코드 우대)
- **데이터 품질과 모델링**: dbt 로 모델링·품질 관리(베이글코드), 포트폴리오에 품질 검증·중복 제거·NULL 점검·익명화를 넣으라는 조언(코멘토 검색 요약)
- 이력서 숫자: 파이프라인 실행 시간, 비용, 데이터 신선도, 실패 감소, 쿼리 성능, 규모(행·파일·파이프라인 수)(DataCamp)
- 면접관은 구조와 **선택 이유**를 깊이 묻는다 — 한 문장 요약, 5분 아키텍처 설명, 다른 방법 대신 이 방식을 고른 이유를 준비(검색 요약)

## 하기 / 하지 않기
- 하기: 흐름을 한 줄로 — 수집 → 저장(형식·분할) → 변환·검사 → 제공. 각 단계의 숫자
- 하기: 정합성 증거(옮긴 건수 = 원본 건수, 비교 14일 중 14일 일치)를 넣는다
- 하지 않기: SQL·Python 기본만 강조 — "대부분 기본으로 갖춘다"(코멘토 검색 요약)
- 하지 않기: 쓰지 않은 Spark·Airflow 를 기술 구역에 넣기

## 키워드
데이터 파이프라인, ETL/ELT, 배치, 스트리밍, 오케스트레이션(Airflow), 예약 작업, 데이터 레이크, Parquet, 파티션, S3, 웨어하우스, 데이터 모델링, dbt, 데이터 품질, 정합성, 리니지, 백필, 멱등성, 보관 기간(리텐션), 개인정보 비식별, SQL 최적화, Terraform

## Sources (접속 2026-10-17)
- [요기요 MLOps팀 Data Engineer — 원티드](https://www.wanted.co.kr/wd/270020)
- [베이글코드 Data Engineer — 리멤버](https://career.rememberapp.co.kr/job/posting/321990)
- [에이블리 데이터 엔지니어 — 원티드](https://www.wanted.co.kr/wd/65802)
- [DataCamp — Data Engineer Resume](https://www.datacamp.com/blog/data-engineer-resume)
- [코멘토 — 데이터 엔지니어 포트폴리오](https://www.comento.kr/job-questions/모든회사/데이터엔지니어/데이터_엔지니어_포트폴리오-465032) — 검색 요약
- [DataExpert-io/data-engineer-handbook (GitHub)](https://github.com/DataExpert-io/data-engineer-handbook)
