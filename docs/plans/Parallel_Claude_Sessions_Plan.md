# 병렬 Claude Code 세션 운영 계획서

작성일: 2026-07-29 · 대상: LW2-3 (VS2022 C++ 솔루션 + Portal 웹) · 환경: Windows 11, VS Code + Claude Code

> 3인의 전문가 관점(① Worktree/병렬 세션, ② 세션 간 조율·공유, ③ 브랜치·병합 전략)으로 영문 공식 문서·커뮤니티 자료를 조사하고 협의하여 도출한 결론입니다. 출처는 문서 말미에 있습니다.

---

## 0. 결론 요약 (Executive Summary)

| 질문 | 결론 |
|---|---|
| 같은 파일을 여러 세션이 수정하면? | **git worktree로 물리적 격리** + **세션=모듈 소유권**으로 애초에 겹치지 않게 분배 |
| 세션 간 진행 공유는? | **git에 커밋되는 태스크 보드 + 핸드오프 문서** (수동·안정). Agent Teams는 아직 실험 기능이라 보류 |
| 세션 수는? | **2개로 시작, 최대 3~4개** (C++ 빌드 CPU 경합·리뷰 대역폭 한계) |
| CEF/OpenCV가 worktree에 없는 문제는? | **NTFS junction**(`mklink /J`)으로 메인 체크아웃의 SDK 폴더를 연결 (복사 금지) |
| 브랜치 전략은? | `feat/<모듈>/<주제>` 단기 브랜치 → 매일 rebase → **병합은 한 번에 하나씩** 직렬화 |
| 시작 전 반드시 할 일은? | **Phase 0 저장소 정비** — `Portal/dist`·`Bin` 산출물 gitignore, `.gitattributes`, CLAUDE.md 작성 (이걸 안 하면 병렬 작업 즉시 충돌 지옥) |

### 전문가 협의에서 갈린 지점과 판정

| 쟁점 | 판정 | 근거 |
|---|---|---|
| Claude 내장 `--worktree` vs 수동 worktree | **수동 (형제 폴더)** | VS Code 확장은 worktree 생성 미지원(기능 요청만 열려 있음), 내장 방식은 `.claude/worktrees/` 경로가 깊어져 Windows MAX_PATH 위험 + 슬래시 커맨드가 깨지는 알려진 버그 존재 |
| Agent Teams(자동 조율) vs 수동 조율 | **수동 조율로 시작** | Agent Teams는 실험 기능(기본 비활성), `/resume` 미복원·세션당 1팀 등 제한 다수. 공식 문서조차 "파일 소유권 분할"을 충돌 해법으로 권고 → 소유권 분할은 수동 방식에서도 동일하게 적용 가능 |
| SDK 폴더: junction vs 복사 vs `.worktreeinclude` | **junction** | 1.5GB 복사는 worktree 생성마다 수 분 소요, `.worktreeinclude`도 복사 방식이라 부적합. junction은 관리자 권한 불필요, git(.gitignore 처리됨)·MSBuild 모두 정상 인식 |
| `Portal/dist` 커밋 유지 vs 제거 | **git에서 제거** | 해시 파일명(`AppShell-DuplPkRO.js`) 탓에 두 세션이 각각 빌드하면 매 병합마다 34개 파일 충돌. 빌드 환경 없는 장비 배포가 필요하면 GitHub Releases/태그로 대체 |

---

## 1. 전체 구조

```
d:\000.Git_Project\
├─ LW2-3\                        ← 메인 체크아웃 (main 브랜치, 통합·병합 전용)
│  ├─ external\cef\              ← SDK 원본 (X:\300.LW2-3 에서 복원됨)
│  └─ VisionModule\FeatureLibrary\OpenCV\
│
└─ LW2-3.wt\                     ← worktree 모음 (형제 폴더, 경로 짧게 유지)
   ├─ vision-blob\               ← 세션 2 (브랜치 feat/vision/blob-detect)
   │  ├─ external\cef            ← junction → 메인의 external\cef
   │  ├─ VisionModule\FeatureLibrary\OpenCV  ← junction
   │  └─ Portal\node_modules     ← worktree별 npm ci (공유 금지)
   └─ portal-recipe\             ← 세션 3 (브랜치 feat/portal/recipe-ui)
```

- **세션 1 = 메인 체크아웃**: 통합 관리자 역할. 병합·rebase 지시·경계 파일(.sln, IPC 스펙) 수정 전담
- **세션 2~N = worktree**: 각자 자기 브랜치·자기 모듈만 작업
- VS Code는 **worktree마다 별도 창**으로 열고, 각 창에서 Claude Code 세션 시작 (확장의 멀티챗은 같은 폴더를 향하므로 파일 격리가 안 됨 — worktree별 창 분리가 정답)

### 세션 소유권 매트릭스 (핵심 규칙)

| 세션 | 쓰기 가능 | 읽기만 | 금지 |
|---|---|---|---|
| S1 통합 (사람+메인) | `.sln`, `.gitignore`, `.gitattributes`, `Portal/ipc·native` 스펙, `docs/tasks/` 판정 | 전체 | — |
| S2 Native 앱 | `LASERnGRAPN/**` (+vcxproj) | VisionModule 헤더, IPC 스펙 | VisionModule/, Portal/, .sln |
| S3 Vision | `VisionModule/**`, `BitbusAssembly/**` (+각 vcxproj) | LASERnGRAPN 인터페이스 헤더 | LASERnGRAPN/, Portal/ |
| S4 Portal 웹 | `Portal/src·public/**`, `package.json`/`package-lock.json` (**유일한 lockfile 소유자**) | IPC 스펙 | dist 커밋, C++ 전체 |

- 크로스 모듈 기능(예: 새 IPC 채널)은 병렬화하지 말 것: **인터페이스 정의 → main 병합 → 양쪽 rebase → 각자 구현** 순서로 직렬 처리
- 의존성 추가는 S4만. 다른 세션은 `npm ci`만 사용 (`npm install` 금지 — lockfile 변형 방지)

---

## 2. Phase 0 — 저장소 정비 (병렬 작업 시작 전 필수, 약 30분)

병렬화 이전에 제거해야 할 지뢰 3개가 조사에서 확인됐습니다.

### 0-1. `Portal/dist` git 제거 *(최우선)*

빌드 산출물 31MB가 커밋되어 있어 두 세션이 각각 `npm run build` 하면 **매 병합마다 충돌**합니다.

```powershell
git rm -r --cached Portal/dist
# .gitignore 에 Portal/dist/ 추가
```

C++ post-build가 `robocopy Portal/dist → Bin/web` 를 수행하므로, dist가 없을 때를 대비해 `build-portal.bat`(`npm ci && npm run build`)을 만들어 C++ 빌드 전 실행하는 절차를 문서화합니다.

### 0-2. `Bin/` 빌드 산출물 gitignore *(잠재 지뢰)*

`LASERnGRAPN.vcxproj`의 OutDir이 `$(SolutionDir)Bin\` 인데 산출물 제외 규칙이 없습니다. 어떤 세션이든 빌드 후 `git add -A` 하면 exe/pdb/libcef.dll 수백 MB가 커밋됩니다(100MB 제한 재발).

```gitignore
# 빌드 산출물 (Bin 아래 커밋 유지 대상: DLLS/, Config/, Image/, Recipe/)
Bin/*.exe
Bin/*.pdb
Bin/*.dll
Bin/*.pak
Bin/*.bin
Bin/*.dat
Bin/*.json.bak
Bin/locales/
Bin/web/
Bin/Log*/
```

추가로 상태성 파일(`Bin/Config/CalibState.json`, calibration history 등)은 실행 테스트만 해도 변경되므로 gitignore 검토 대상입니다.

### 0-3. `.gitattributes` 생성 — vcxproj/sln 텍스트 병합 강제

```gitattributes
*.sln      text eol=crlf merge=text
*.vcxproj  text eol=crlf merge=text
*.filters  text eol=crlf merge=text
```

파일 추가로 인한 vcxproj 충돌은 대부분 "양쪽 다 채택"이 정답이라 충돌 마커만 찍히면 세션이 스스로 해결할 수 있습니다 (Microsoft calculator 저장소 실사례 패턴).

### 0-4. rerere 활성화

```powershell
git config rerere.enabled true   # 반복 rebase 시 동일 충돌 자동 재적용
```

---

## 3. Phase 1 — Worktree 인프라 (스크립트 2개)

### 3-1. 생성: `scripts\new-worktree.ps1`

```powershell
param(
    [Parameter(Mandatory)][string]$Name,     # 예: vision-blob
    [Parameter(Mandatory)][string]$Branch    # 예: feat/vision/blob-detect
)
$Main = "d:\000.Git_Project\LW2-3"
$Wt   = "d:\000.Git_Project\LW2-3.wt\$Name"

git -C $Main fetch origin main
git -C $Main worktree add $Wt -b $Branch origin/main

# SDK junction (복사 아님 — 메인 체크아웃의 물리 폴더를 공유)
New-Item -ItemType Junction -Path "$Wt\external\cef" `
         -Target "$Main\external\cef" | Out-Null
New-Item -ItemType Junction -Path "$Wt\VisionModule\FeatureLibrary\OpenCV" `
         -Target "$Main\VisionModule\FeatureLibrary\OpenCV" | Out-Null

# Portal 의존성 (node_modules는 worktree별 독립 — 공유 금지)
Push-Location "$Wt\Portal"; npm ci --prefer-offline; Pop-Location

Write-Host "완료. VS Code: code $Wt"
```

### 3-2. 제거: `scripts\remove-worktree.ps1`

```powershell
param([Parameter(Mandatory)][string]$Name)
$Main = "d:\000.Git_Project\LW2-3"
git -C $Main worktree remove "d:\000.Git_Project\LW2-3.wt\$Name"   # junction은 링크만 제거됨
git -C $Main worktree prune
```

### ⚠️ 절대 금지 사항 (원본 SDK 삭제 사고 방지)

> **worktree 폴더를 `Remove-Item -Recurse -Force` 로 지우지 마십시오.**
> PowerShell의 Remove-Item은 junction **내부로 따라 들어가 원본**(`LW2-3\external\cef` 958MB)**을 삭제**합니다. 실제 사고 사례가 다수 보고되어 있습니다 (pnpm #10707, claude-code #29249).
> 정리는 반드시 `git worktree remove` 또는 `cmd /c "rmdir /S /Q <경로>"` 만 사용하세요 (둘 다 junction을 링크로만 제거).

기타 주의:
- `git clean -dfx` 는 최신 Git for Windows에서만 junction 안전 — `git --version` 2.24+ 확인
- 같은 브랜치를 두 worktree에서 동시 체크아웃 불가 (git 제약)
- Vite dev 서버는 worktree별 포트 분리 (`npm run dev -- --port 5174`)
- SDK 폴더는 여러 worktree가 **하나의 물리 폴더를 공유**하므로 어떤 세션도 SDK 폴더 내부를 수정하면 안 됨 (읽기 전용 입력으로만 사용)

---

## 4. Phase 2 — 세션 간 조율 체계 (파일 기반, git이 공유 채널)

세션은 서로의 대화를 볼 수 없습니다. **git에 커밋되는 파일이 유일하게 신뢰할 수 있는 공유 채널**입니다.

### 4-1. 태스크 보드: `docs/tasks/` (태스크당 파일 1개)

하나의 거대한 TASKS.md는 그 자체가 병합 충돌 지점이 됩니다. **태스크당 파일 1개**로 쪼갭니다.

```markdown
<!-- docs/tasks/012-vision-blob-detect.md -->
---
id: 12
title: Blob 검출 파라미터 UI 연동
status: in-progress        # backlog → in-progress → review → done (+blocked)
claimed_by: S3-vision      # 세션 식별자
branch: feat/vision/blob-detect
depends_on: []
files:                     # 이 태스크가 수정할 파일 범위 (소유권 명시)
  - VisionModule/VisionModule/Core/**
  - VisionModule/VisionModule/UI/BlobPanel.*
---
## 목표
...
## 완료 조건
- [ ] VisionModule.sln Release 빌드 통과
```

규칙:
- 작업 시작 전 **claim**: `claimed_by` + `status` 갱신 → 커밋 → push. **쓰기 전에 반드시 pull 하여 최신 상태 재확인** (다른 세션이 먼저 claim 했을 수 있음)
- `files:` 목록 밖의 파일은 수정 금지. 남의 소유 파일이 필요하면 수정하지 말고 태스크를 `blocked` 로 표시 후 보고

### 4-2. 핸드오프 문서: `docs/handoffs/`

세션 종료·중단·컨텍스트 한계 도달 전에 작성합니다. 파일명에 세션·시각을 넣어 **서로 덮어쓰지 않게** 합니다.

```markdown
<!-- docs/handoffs/2026-07-29_1530_S3-vision.md -->
# Handoff — S3-vision, 2026-07-29 15:30
**브랜치:** feat/vision/blob-detect · **상태:** ACTIVE
## 완료한 것
## 되지 않았던 것 (원인 포함)      ← 다음 세션의 시행착오 방지, 가장 중요
## 현재 상태 (빌드 통과 여부, 미커밋 변경)
## 핵심 결정 사항
## 다음 단계
```

### 4-3. `CLAUDE.md` — 모든 세션이 자동 로드하는 조율 허브

저장소 루트에 생성합니다 (200줄 이하 유지 — 길수록 준수율 하락).

```markdown
# LW2-3 멀티 세션 규칙

이 저장소는 여러 Claude Code 세션이 병렬로 작업한다.

## 시작 절차
1. docs/tasks/ 에서 자기 태스크를 확인·claim 하고 시작하라 (쓰기 전 pull로 재확인)
2. docs/handoffs/ 의 최근 문서를 읽어라

## 소유권
- 자기 태스크의 files: 목록 밖 파일은 수정 금지. 필요하면 blocked 표시 후 보고
- .sln / Portal/ipc / Portal/native 스펙 / .gitignore 는 통합 세션(S1) 전용
- package.json / package-lock.json 은 Portal 세션(S4) 전용. 나머지는 npm ci만 사용

## 브랜치
- 이 세션은 자기 worktree의 브랜치에서만 작업한다. main 직접 push 금지
- 작은 단위로 자주 커밋 (커밋 = 재시작 가능한 상태 선언)
- 매일 작업 시작 시 git fetch && git rebase origin/main

## 빌드·커밋 위생
- Portal/dist, Bin의 exe/pdb/dll 등 빌드 산출물을 커밋하지 마라
- git add -A 대신 파일을 지정해 add 하라
- SDK 폴더(external/cef, VisionModule/FeatureLibrary/OpenCV)는 junction 공유 —
  절대 내용을 수정·삭제하지 마라

## 종료 절차
- docs/handoffs/ 에 핸드오프 문서 작성 → 커밋 → push
```

---

## 5. Phase 3 — 브랜치·병합 운영 규칙

### 브랜치 네이밍

```
feat/<모듈>/<주제>     feat/vision/blob-detect, feat/portal/recipe-ui
fix/<모듈>/<주제>      fix/laser/galvo-timeout
docs/<주제>            docs/plan-review
```

수명은 몇 시간~1일. PR은 작게(±200라인 내외) 자주.

### 동기화·병합 사이클

```
① worktree 생성 시: 항상 최신 origin/main 에서 분기
② 매일 + main 변경 시마다: 각 세션이 git rebase origin/main (충돌은 브랜치 소유 세션이 해결)
③ 병합 전 게이트: 최신 main 리베이스 완료 + 해당 모듈 로컬 빌드 통과 + git status clean
④ 병합은 직렬화: 하나 병합 → 나머지 전부 rebase → 다음 병합  (동시 병합 금지)
⑤ GitHub squash merge 권장 (1인 팀, 히스토리 단순화)
```

### 검증 (CI)

| 대상 | 방식 | 비고 |
|---|---|---|
| Portal | **GitHub Actions 즉시 도입 가능** — `npm ci && npx tsc --noEmit && npm run build` (ubuntu, 2~3분) | 의존성이 전부 저장소/npm에 있음 |
| C++ | **병합 전 로컬 빌드 정책** — `msbuild <모듈>.sln /m /p:Configuration=Release` | SDK 1.5GB가 저장소에 없어 hosted runner 비실용. 팀 확장 시 사내 PC self-hosted runner 도입이 정석 경로 |

---

## 6. Phase 4 — 확장 (당장은 하지 않음)

- **Agent Teams** (공유 태스크 목록 + 세션 간 자동 메시징): `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 로 활성화 가능하나 실험 기능 — `/resume` 시 teammate 미복원, 세션당 1팀, 토큰 비용이 teammate 수에 선형 비례. **Phase 2의 파일 기반 조율이 몸에 붙은 뒤, 기능이 안정화되면 재평가**. 그때도 태스크 분해·파일 소유권 원칙은 그대로 유효(공식 문서의 권고도 동일)
- **self-hosted runner**: 팀원 증가 시 C++ CI 자동화
- **pnpm 전환**: worktree가 4개 이상으로 늘어 node_modules 디스크가 부담되면 (content-addressable store로 자동 중복 제거)

---

## 7. 실행 체크리스트

**Phase 0 — 저장소 정비 (1회)**
- [ ] `Portal/dist` git 제거 + gitignore
- [ ] `Bin/` 산출물 gitignore 추가
- [ ] `.gitattributes` 생성 (vcxproj/sln text merge)
- [ ] `git config rerere.enabled true`
- [ ] `CLAUDE.md` 작성
- [ ] `docs/tasks/`, `docs/handoffs/` 디렉터리 + 템플릿 커밋
- [ ] `scripts/new-worktree.ps1`, `scripts/remove-worktree.ps1` 커밋

**세션 시작 (매번)**
- [ ] 태스크 파일 작성(`files:` 소유권 명시) → `new-worktree.ps1 -Name <이름> -Branch feat/<모듈>/<주제>`
- [ ] `code d:\000.Git_Project\LW2-3.wt\<이름>` → 새 VS Code 창에서 Claude 세션 시작
- [ ] 세션에게 태스크 파일 경로를 알려주고 claim 시키기

**세션 종료 (매번)**
- [ ] 핸드오프 문서 작성·커밋·push
- [ ] 병합 게이트 통과 → squash merge → 나머지 세션 rebase 지시
- [ ] `remove-worktree.ps1 -Name <이름>` (**Remove-Item 절대 금지**)

---

## 8. 참고 자료 (조사 출처)

**공식 문서**
- Worktrees — https://code.claude.com/docs/en/worktrees
- Agent Teams — https://code.claude.com/docs/en/agent-teams
- Memory/CLAUDE.md — https://code.claude.com/docs/en/memory
- Best practices — https://code.claude.com/docs/en/best-practices

**핵심 커뮤니티 자료**
- worktree 병렬 에이전트 실행 가이드 (비중첩 파일 도메인, rebase-before-merge) — https://www.augmentcode.com/guides/git-worktrees-parallel-ai-agent-execution
- 다중 세션 조율 (CLAUDE.md 프레즌스 규약) — https://dev.to/sahil_kat/coordinate-multiple-claude-code-sessions-on-a-shared-repo-1dh4
- 마크다운 태스크 보드 — https://dev.to/battyterm/i-let-ai-agents-manage-themselves-with-a-markdown-file-5547
- 세션 핸드오프 규칙 — https://github.com/AnastasiyaW/claude-code-config/blob/main/rules/session-handoff.md
- vcxproj text merge 실사례 — https://github.com/Microsoft/calculator/pull/474
- pnpm과 worktree — https://pnpm.io/git-worktrees

**사고·버그 근거**
- Remove-Item의 junction 원본 삭제 — https://github.com/pnpm/pnpm/issues/10707 , https://github.com/anthropics/claude-code/issues/29249
- git clean junction 수정 — https://github.com/git-for-windows/git/pull/2268
- VS Code 확장 worktree 기능 요청(미구현) — https://github.com/anthropics/claude-code/issues/69554
