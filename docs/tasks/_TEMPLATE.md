---
id: 0                       # 고유 번호 (파일명 접두어와 일치: 001-, 002-, ...)
title: 태스크 제목
status: backlog             # backlog → in-progress → review → done (+blocked)
claimed_by:                 # 세션 식별자 (예: S3-vision). claim 시 기입
branch:                     # 예: feat/vision/blob-detect
depends_on: []              # 선행 태스크 id 목록
files:                      # 이 태스크가 수정할 파일 범위 — 목록 밖 파일은 수정 금지
  - path/to/dir/**
---

## 목표

(무엇을, 왜)

## 상세

(구현 지침, 참고 파일, 제약)

## 완료 조건

- [ ] 영향 모듈 빌드 통과
- [ ] (기능별 확인 항목)

<!--
사용 규칙 (CLAUDE.md 참조):
1. 이 템플릿을 복사해 docs/tasks/NNN-<주제>.md 로 저장 (태스크당 파일 1개)
2. claim: 쓰기 전 git pull 로 최신 확인 → claimed_by/status 갱신 → 커밋·push
3. files: 목록이 다른 태스크와 겹치면 병렬 배정 금지 (직렬화할 것)
-->
