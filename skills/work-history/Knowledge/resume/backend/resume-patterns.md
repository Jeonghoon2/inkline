# 백엔드 — 이력서 패턴

## 성과 고르기·순서
1. 운영 장애·성능 문제 해결(트러블슈팅) — 원인 → 근거 → 수치
2. 응답·처리 시간 단축, 메모리·비용 절감(전 → 후)
3. 데이터 안전: 마이그레이션·이관·삭제를 잃지 않고 한 일(백업·건수 대조)
4. 보안·개인정보(암호화·감사 기록·최소 권한)
5. 테스트·배포 체계(통합 테스트 수, CI, 무중단 교체)
- 화면 작업은 맨 아래 한 줄 또는 빼기

## 문장 꼴
- `**주문 목록 조회 4.2초 → 0.6초**: 실행 계획으로 표 전체를 읽는 것을 찾아 사용자·날짜 복합 인덱스 추가`
- 기술 이름은 '어떻게' 쪽에. DB 단어(잠금·인덱스·거래·마이그레이션)는 줄 안에 그대로

## 기술 구역
- 언어·프레임워크 / DB / 클라우드·인프라(서비스 이름) / 테스트·CI / 보안 — 공고 단어 순서
- 써 보지 않은 Redis·Kafka 는 넣지 않는다

## 간단 소개(2~4줄)
- "운영 데이터로 원인을 재현해 고치는 백엔드 개발자" + 대표 수치 1~2개(예: 조회 4.2초 → 0.6초, 메모리 75% 절감) + 주력 스택 두셋

## Sources (접속 2026-10-17)
- [Enhancv — Backend Engineer Resume Examples](https://enhancv.com/resume-examples/backend-engineer/)
- [토스뱅크 Server Developer (Platform) — 리멤버](https://career.rememberapp.co.kr/job/posting/258044)
- [Google SRE Book — Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
