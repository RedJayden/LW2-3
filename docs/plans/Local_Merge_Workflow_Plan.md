# 로컬 병합 중심 워크플로 계획서

작성일: 2026-07-31 · 전제: docs/plans/Parallel_Claude_Sessions_Plan.md 의 인프라(Phase 0~1) 구축 완료

## 0. 질문과 결론

> **질문**: VS Code에서 로컬 git으로 개별 세션이 작업하고, 완료 후 로컬에서 merge 한 뒤, 최종 결과만 온라인 git(GitHub)으로 올리는 방식이 가능한가?

**결론: 가능하며, 1인 + 다중 세션 체제에서는 GitHub PR 방식보다 오히려 간결합니다.**

git은 분산 버전 관리 시스템이라 **모든 기능(브랜치, 병합, 이력)이 로컬에서 완결**됩니다. GitHub는 필수 관문이 아니라 "백업 + 배포 + (나중에) 협업 창구"일 뿐입니다. 병합을 로컬에서 끝내고 push는 통합 시점에만 하는 것은 git의 정상적인 사용 방식입니다.

이미 구축된 구조가 이 방식과 정확히 일치합니다:

```
[worktree 세션들] ──(로컬 브랜치 커밋)──▶ [메인 체크아웃 main] ──(로컬 merge)──▶ [git push] ──▶ GitHub
   LW2-3.wt\*            feat/<모듈>/<주제>        d:\...\LW2-3                      통합 시점에만
```

worktree 들은 **하나의 로컬 저장소(.git)를 공유**하므로, 세션이 자기 브랜치에 커밋하는 순간 메인 체크아웃에서 즉시 그 브랜치가 보입니다. 별도의 "로컬 git 서버"를 만들 필요가 없습니다.

---

## 1. 구성안 비교 — "로컬 git 생성"의 두 가지 해석

### 구성안 A (권장): 단일 저장소 + worktree — 현재 구조 그대로

```
d:\000.Git_Project\LW2-3\        ← 저장소 본체(.git) + main 체크아웃 = 통합 허브
d:\000.Git_Project\LW2-3.wt\*    ← 세션별 worktree (같은 .git 공유, 브랜치만 다름)
                └─ origin = github.com/RedJayden/LW2-3 (push는 통합 후에만)
```

- 세션 커밋 → 즉시 로컬 저장소에 존재. 네트워크·중간 저장소 불필요
- 병합: 메인 체크아웃(main)에서 `git merge` — 완전 로컬
- push: 통합 세션(S1)이 원하는 시점에 `git push origin main` 한 번

### 구성안 B (비권장): 로컬 bare 저장소를 사내 허브로 두는 방식

```
d:\git-hub\LW2-3.git (bare)  ←push/pull→  각 세션의 독립 clone
        └─(주기적 push)─▶ GitHub
```

- 세션마다 완전한 clone 이 필요 → 저장소 190MB × N + node_modules × N + **SDK junction 을 clone 마다 다시 구성**
- worktree 가 주는 "커밋 즉시 공유" 이점이 사라지고 fetch/push 단계가 추가됨
- 이 방식이 의미 있는 경우는 단 하나: **물리적으로 다른 PC 여러 대**가 오프라인 LAN에서 협업할 때. 현재(한 PC, 다중 세션)는 순수한 오버헤드

**판정: 구성안 A.** "로컬 git" = 이미 있는 로컬 저장소이며, 새로 만들 것은 없습니다.

---

## 2. 워크플로 상세 (구성안 A)

### 2-1. 세션 작업 (기존과 동일)

```powershell
.\scripts\new-worktree.ps1 -Name vision-blob -Branch feat/vision/blob-detect
code D:\000.Git_Project\LW2-3.wt\vision-blob   # 새 VS Code 창 → Claude 세션
# 세션: 태스크 claim → 작은 단위로 커밋 (push 불필요!)
```

기존 계획과의 유일한 차이: **세션은 push 하지 않습니다.** 커밋만 하면 로컬 저장소에 남고, 통합 세션이 바로 볼 수 있습니다. (기존 규칙에서도 세션의 main push 는 금지였으므로 규칙 위반 요소 없음)

### 2-2. 로컬 병합 — 통합 세션(S1, 메인 체크아웃)에서

```powershell
cd d:\000.Git_Project\LW2-3          # main 체크아웃

# ① 병합 게이트 확인 (CLAUDE.md 규칙과 동일)
git log --oneline main..feat/vision/blob-detect     # 병합될 내용 검토
#    - 해당 worktree 에서 모듈 빌드 통과했는가
#    - git status clean 인가 (빌드 산출물 미포함)

# ② 브랜치를 최신 main 위로 (해당 브랜치 소유 세션에게 시키는 것이 원칙)
#    worktree 쪽에서: git rebase main

# ③ 로컬 병합 — 둘 중 택일
git merge --squash feat/vision/blob-detect && git commit   # 권장: main 이력 1커밋으로 깔끔
#   또는
git merge --ff-only feat/vision/blob-detect                # 세션 커밋 이력을 그대로 보존

# ④ 다른 활성 브랜치들에게 rebase 지시 (병합 직렬화 — 한 번에 하나씩)

# ⑤ worktree 정리
.\scripts\remove-worktree.ps1 -Name vision-blob
git branch -d feat/vision/blob-detect
```

`--squash`(권장)는 GitHub squash merge 와 동일한 결과를 로컬에서 만듭니다. main 이력이 "태스크 = 커밋 1개"로 유지되어 되돌리기 쉽습니다.

### 2-3. 온라인 반영 — 통합 시점에만 push

```powershell
git push origin main
```

push 주기 권장:

| 시점 | 이유 |
|---|---|
| **병합 1건 완료 시마다 (권장)** | push 비용은 수 초. 로컬 디스크 장애 시 잃는 것이 없도록 |
| 최소 1일 1회 (하한선) | GitHub 가 유일한 오프사이트 백업임 — push 안 한 기간 = 유실 위험 기간 |
| 마일스톤 단위만 push | 가능하지만 비권장. "깨끗한 것만 올리고 싶다"는 squash 병합이 이미 해결함 |

---

## 3. GitHub PR 방식과 비교

| 항목 | 로컬 병합 (이 계획) | GitHub PR |
|---|---|---|
| 병합 절차 | main 체크아웃에서 명령 2줄 | 브랜치 push → PR 생성 → 웹에서 merge → pull |
| 속도 | 즉시, 오프라인 가능 | 네트워크 왕복 다수 |
| 코드 리뷰 | VS Code diff / `git log -p` 로 직접 | PR 리뷰 UI (1인 팀에겐 자기 승인) |
| CI 연동 | push 후에만 동작 (병합 전 게이트로는 못 씀) | PR 필수 체크 가능 |
| 이력 | squash 로 동일하게 유지 가능 | squash merge |
| 협업 확장 | 팀원 합류 시 PR 로 전환 필요 | 그대로 확장 |

**전환 기준**: 다른 팀원이 이 저장소에 직접 커밋하기 시작하는 순간 PR 방식으로 전환하십시오. 그 전까지(1인 + 다중 세션) PR 은 형식 비용만 있고 이득이 없습니다. Portal GitHub Actions CI 를 도입하더라도 "push 후 사후 검증 + 로컬 빌드 게이트" 조합으로 충분합니다.

---

## 4. 규칙 변경점 (CLAUDE.md 대비)

기존 규칙은 거의 그대로 유효합니다. 바뀌는 것은 두 가지뿐:

1. **세션의 브랜치 push 불필요** — 커밋만으로 공유됨. (태스크 claim/핸드오프 문서도 로컬 커밋만으로 다른 세션에 보임 — 단, 다른 세션이 보려면 자기 worktree 에서 `git log`/`git show` 로 확인하거나 rebase 시 자연 반영)
2. **병합 게이트의 "PR" 문구 → "로컬 병합"** — 게이트 항목 자체(rebase 완료·빌드 통과·status clean·직렬화)는 동일

주의가 하나 추가됩니다:

> **태스크 보드/핸드오프의 공유 시점**: PR 방식에서는 push 가 곧 공유였지만, 로컬 방식에서는 **커밋이 곧 공유**입니다. 세션들이 같은 파일(`docs/tasks/*.md`)을 각자 브랜치에서 수정하면 병합 때 충돌하므로, 태스크 claim 은 가능하면 **통합 세션(S1)이 main 에서 직접 커밋**하고, 작업 세션은 자기 태스크 파일의 상태 갱신만 자기 브랜치에서 수행하는 편이 안전합니다.

---

## 5. 실행 체크리스트

**즉시 적용 (추가 구축 없음)**
- [ ] 세션들에게 "push 하지 말 것, 커밋까지만" 공지 (CLAUDE.md 는 이미 main push 금지)
- [ ] 병합은 메인 체크아웃에서 `git merge --squash` + 게이트 준수
- [ ] 병합 완료마다 `git push origin main` (백업)

**선택**
- [ ] CLAUDE.md 병합 게이트 문구를 "PR/병합" → "로컬 병합" 으로 손질
- [ ] 팀원 합류 시: 이 문서 3장 기준으로 PR 방식 전환

## 6. 요약

- **가능한가?** — 예. git 은 로컬에서 완결되며, GitHub 는 push 시점에만 관여합니다.
- **무엇을 새로 만들어야 하나?** — 없음. 현재 worktree 인프라가 그대로 이 방식입니다. "로컬 git 서버"(bare 저장소)는 한 PC 환경에서는 불필요한 중간 단계입니다.
- **운영 원칙 3줄**: 세션은 커밋까지만 / 병합은 main 체크아웃에서 squash 로 한 번에 하나씩 / 병합할 때마다 push 로 백업.
