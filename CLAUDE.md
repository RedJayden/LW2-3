# LW2-3 멀티 세션 규칙

이 저장소는 여러 Claude Code 세션이 병렬로 작업한다.
전체 운영 규칙: docs/plans/Parallel_Claude_Sessions_Plan.md
병합 방식: **로컬 병합 중심** — docs/plans/Local_Merge_Workflow_Plan.md
(세션은 커밋까지만, 병합은 메인 체크아웃에서, GitHub push 는 통합 세션 전담)

## 시작 절차
1. `docs/tasks/` 에서 자기 태스크 파일을 확인하고 claim(`claimed_by` + `status: in-progress`)한 뒤 시작하라. **claim 커밋은 통합 세션(S1)이 main 에서 수행**하는 것이 원칙 — 작업 세션은 시작 전 `git log main -- docs/tasks/` 로 최신 claim 상태를 확인하라 (다른 세션이 먼저 claim 했을 수 있다).
2. `docs/handoffs/` 의 최근 문서를 읽어라.

## 소유권 (파일 경계)
- 자기 태스크의 `files:` 목록 밖 파일은 수정 금지. 필요하면 태스크를 `blocked` 로 표시하고 보고 후 대기.
- 다음은 통합 세션(S1) 전용 — 다른 세션은 수정 금지: `*.sln`, `.gitignore`, `.gitattributes`, `Portal/ipc/`·`Portal/native/` 스펙, `docs/tasks/` 의 태스크 판정.
- `package.json` / `package-lock.json` 은 Portal 세션(S4) 전용. 나머지 세션은 `npm ci` 만 사용하고 `npm install` 은 금지.
- 크로스 모듈 작업(예: 새 IPC 채널)은 병렬화하지 말 것: 인터페이스 정의 → main 병합 → 각 세션 rebase → 각자 구현 순서로 직렬 처리.

## 브랜치
- 이 세션은 자기 worktree 의 브랜치(`feat/<모듈>/<주제>`)에서만 작업한다. **작업 세션은 push 금지** — 커밋만으로 로컬 저장소에 공유된다 (worktree 는 같은 .git 을 공유). `git push` 는 통합 세션(S1)만 수행한다.
- 작은 단위로 자주 커밋하라 (커밋 = 재시작 가능한 상태 선언).
- 매일 작업 시작 시 + main 에 병합이 발생할 때마다: `git rebase main`. 충돌은 이 브랜치를 소유한 세션이 해결한다.

## 빌드·커밋 위생
- 빌드 산출물을 커밋하지 마라: `Portal/dist/`, `Bin/` 루트의 exe/pdb/dll (추적 유지 대상은 `Bin/Config|DLLS|Image|Recipe` 뿐).
- `git add -A` 대신 파일을 지정해 add 하라.
- SDK 폴더(`external/cef/`, `VisionModule/FeatureLibrary/OpenCV/`)는 여러 worktree 가 junction 으로 **하나의 물리 폴더를 공유**한다 — 절대 내용을 수정·삭제하지 마라. 복원 방법: docs/EXTERNAL_DEPENDENCIES.md
- worktree 폴더를 `Remove-Item -Recurse` 로 지우지 마라 (junction 을 따라 원본 SDK 가 삭제된다). 정리는 `scripts/remove-worktree.ps1` 또는 `git worktree remove` 만 사용.
- `Portal/dist` 가 필요하면(C++ 빌드 전) 루트의 `build-portal.bat` 실행.

## 병합 게이트 (로컬 병합 전 필수 — 통합 세션(S1)이 메인 체크아웃에서 수행)
1. 대상 브랜치가 최신 `main` 위로 rebase 완료 (해당 브랜치 소유 세션이 수행)
2. 영향 모듈 로컬 빌드 통과 (C++: `msbuild <모듈>.sln /m /p:Configuration=Release`, Portal: `npm run build`)
3. `git status` clean (빌드 산출물 미포함 확인)
4. 병합은 `git merge --squash <브랜치>` 로 한 번에 하나씩 — 병합 직후 다른 활성 브랜치들은 rebase 부터 다시.
5. 병합 완료마다 `git push origin main` (GitHub = 오프사이트 백업, push 주기가 곧 유실 허용 범위).

## 종료 절차
- `docs/handoffs/` 에 핸드오프 문서를 작성(템플릿: `docs/handoffs/_TEMPLATE.md`)하고 **자기 브랜치에 커밋**하라 (push 불필요 — 커밋이 곧 공유). 파일명: `YYYY-MM-DD_HHMM_<세션ID>.md`
- 자기 태스크 파일의 상태를 갱신(`review` 또는 `done`)하고 커밋하라. 최종 판정(`done` 확정·병합)은 통합 세션(S1) 몫이다.

## 응답 언어
- 답변과 문서 파일은 한국어로 작성한다.
