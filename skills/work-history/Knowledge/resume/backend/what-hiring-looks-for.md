# 백엔드 — 채용이 보는 것

## 핵심 정리
- **운영에서 문제를 데이터로 분석해 고친 경험**. 토스플레이스 공고는 장애·성능 문제를 "데이터에 기반해 분석"하고 코드·구조로 해결한 경험을 자격요건에 둔다. 토스뱅크는 우대사항으로 "어려운 과제를 극복한 과정"의 구체 사례 1개 이상을 요구한다
- **분산 환경의 기본기**: 동시성·상태·타임아웃·재시도·중복 처리·부분 실패(토스플레이스 자격요건)
- **데이터 모델과 API 계약 설계**, 변경이 쓰는 팀에 주는 영향 관리(테스트·버전·점진적 마이그레이션)
- **규모·성능·안정성 숫자**: 처리량(rps), 지연(p50/p95/p99), 가동률, 비용(Enhancv·resumegeni 예시 공통). 리뷰어는 "scale, performance, reliability"를 먼저 본다(검색 요약)
- 관측성: 증상과 원인을 나누고, 평균이 아니라 분포(백분위)로 본다(Google SRE). 지연·트래픽·오류·포화 네 신호
- 클라우드는 'AWS' 한 단어가 아니라 **서비스 이름**(ECS·RDS·S3·EventBridge…)으로

## 하기 / 하지 않기
- 하기: 트러블슈팅 1건을 '상황 → 원인 찾기 → 고른 방법과 근거 → 수치'로 가장 위에
- 하기: 트랜잭션·잠금·인덱스·마이그레이션처럼 DB 깊이를 보여 주는 단어를 줄 안에
- 하지 않기: 화면 작업을 백엔드 이력서 위쪽에 두기 — 아래로 내리거나 한 줄로 묶는다
- 하지 않기: 측정하지 않은 '대용량 트래픽' 주장

## 키워드
API 설계, REST, 데이터 모델링, 트랜잭션, 잠금, 인덱스, 마이그레이션, 동시성, 멱등성, 재시도, 타임아웃, 캐시, 메시지 큐, 배치, 예약 작업, 관측성, 로그, 경보, 장애 대응, 무중단 배포, IaC, 보안, 개인정보 암호화, 테스트(통합·회귀)

## Sources (접속 2026-10-17)
- [토스플레이스 Server Developer (Platform) — 원티드](https://www.wanted.co.kr/wd/347509)
- [토스뱅크 Server Developer (Platform) — 리멤버](https://career.rememberapp.co.kr/job/posting/258044)
- [Enhancv — Backend Engineer Resume Examples](https://enhancv.com/resume-examples/backend-engineer/)
- [resumegeni — 레벨별 Backend Developer 이력서 예시](https://resumegeni.com/ko/blog/backend-developer-resume-examples) — 검색 요약으로만 확인
- [Google SRE Book — Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
