# LW2-3 멀티 세션 규칙

이 저장소는 여러 Claude Code 세션이 병렬로 작업한다.
전체 운영 규칙: docs/plans/Parallel_Claude_Sessions_Plan.md

## 시작 절차
1. `docs/tasks/` 에서 자기 태스크 파일을 확인하고 claim(`claimed_by` + `status: in-progress`)한 뒤 시작하라. **쓰기 전에 `git pull` 로 최신 상태를 재확인**하라 (다른 세션이 먼저 claim 했을 수 있다).
2. `docs/handoffs/` 의 최근 문서를 읽어라.

## 소유권 (파일 경계)
- 자기 태스크의 `files:` 목록 밖 파일은 수정 금지. 필요하면 태스크를 `blocked` 로 표시하고 보고 후 대기.
- 다음은 통합 세션(S1) 전용 — 다른 세션은 수정 금지: `*.sln`, `.gitignore`, `.gitattributes`, `Portal/ipc/`·`Portal/native/` 스펙, `docs/tasks/` 의 태스크 판정.
- `package.json` / `package-lock.json` 은 Portal 세션(S4) 전용. 나머지 세션은 `npm ci` 만 사용하고 `npm install` 은 금지.
- 크로스 모듈 작업(예: 새 IPC 채널)은 병렬화하지 말 것: 인터페이스 정의 → main 병합 → 각 세션 rebase → 각자 구현 순서로 직렬 처리.

## 브랜치
- 이 세션은 자기 worktree 의 브랜치(`feat/<모듈>/<주제>`)에서만 작업한다. **main 직접 push 금지.**
- 작은 단위로 자주 커밋하라 (커밋 = 재시작 가능한 상태 선언).
- 매일 작업 시작 시: `git fetch origin && git rebase origin/main`. 충돌은 이 브랜치를 소유한 세션이 해결한다.

## 빌드·커밋 위생
- 빌드 산출물을 커밋하지 마라: `Portal/dist/`, `Bin/` 루트의 exe/pdb/dll (추적 유지 대상은 `Bin/Config|DLLS|Image|Recipe` 뿐).
- `git add -A` 대신 파일을 지정해 add 하라.
- SDK 폴더(`external/cef/`, `VisionModule/FeatureLibrary/OpenCV/`)는 여러 worktree 가 junction 으로 **하나의 물리 폴더를 공유**한다 — 절대 내용을 수정·삭제하지 마라. 복원 방법: docs/EXTERNAL_DEPENDENCIES.md
- worktree 폴더를 `Remove-Item -Recurse` 로 지우지 마라 (junction 을 따라 원본 SDK 가 삭제된다). 정리는 `scripts/remove-worktree.ps1` 또는 `git worktree remove` 만 사용.
- `Portal/dist` 가 필요하면(C++ 빌드 전) 루트의 `build-portal.bat` 실행.

## 병합 게이트 (PR/병합 전 필수)
1. 최신 `origin/main` 위로 rebase 완료
2. 영향 모듈 로컬 빌드 통과 (C++: `msbuild <모듈>.sln /m /p:Configuration=Release`, Portal: `npm run build`)
3. `git status` clean (빌드 산출물 미포함 확인)
4. 병합은 한 번에 하나씩 — 다른 PR 병합 직후에는 rebase 부터 다시.

## 종료 절차
- `docs/handoffs/` 에 핸드오프 문서를 작성(템플릿: `docs/handoffs/_TEMPLATE.md`)하고 커밋·push 하라. 파일명: `YYYY-MM-DD_HHMM_<세션ID>.md`
- 태스크 상태를 갱신(`review` 또는 `done`)하라.

## 응답 언어
- 답변과 문서 파일은 한국어로 작성한다.
