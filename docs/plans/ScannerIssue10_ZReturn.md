# Scanner 이상 증상 10차 — Cumulative Z 가공 후 시작 Z 미복귀 (2026-07-23)

> 실기 보고: "Z-Axis Cumulative Offset 가공 시 Z가 셀마다 증감하며 가공되는 것은 정상이나,
> **가공이 끝나면 최초 시작 Z로 복귀해야 하는데 마지막 Z 위치에서 끝난다.**"
> 원인 분석 및 수정계획서. **승인 후 구현.**
> 선행: `ScannerIssue.md` §H/§I(색상별 Z·Z_MOVE 파킹), `ScannerIssue7_MarkTimes100.md`(REPEAT 블록),
> `ScannerIssue9_Circle_Bit0_and_MarkTimesUI.md`(REPEAT 전면 래핑 계획).

---

## 1. 현행 복귀 메커니즘 (코드 확정)

Z 복귀는 이미 두 층위로 "존재는" 한다:

1. **프론트 꼬리 Z_MOVE** — [`ScannerGenerator.ts:287-290`](../../Portal/src/services/ScannerGenerator.ts#L287-L290):
   ```ts
   const baseZ = options.currentZ ?? 0;      // :217 — 호출부가 넘긴 "시작 Z"
   ...
   if (context.lastZ !== undefined && context.lastZ !== baseZ) {
       commands.push({ type: 'Z_MOVE', x: 0, y: 0, z: baseZ });   // 명령 스트림 맨 끝에 복귀 명령
   }
   ```
   `baseZ`의 원천은 [`SinoGalvoProcessPanel.tsx:130`](../../Portal/src/ui/shell/SinoGalvoProcessPanel.tsx#L130)의
   `currentZ: useAppStore.getState().positions.Z` — **Process Start(생성) 시점의 "폴링 스토어" Z 값**이다.
2. **드라이버 실행** — `SinoGalvoController.cpp Run()` Z_MOVE 분기(:420~)가 각 Z_MOVE에서 버퍼 flush 후
   `zMoveCallback(cmd.z)`를 호출하고, 콜백(`PortalRouterHandler.cpp:1942-1977`)이 `MovAbs` + 정착 대기(≤1.5s)로
   실제 Z축을 움직인다. **마지막 명령이 꼬리 Z_MOVE여도 실행 자체는 된다**(분기 무조건 통과 확인).

### 실기 로그 실증 (`Bin\Log\Log_2026-07-23.txt`, 18:15 런 — 1×7 매트릭스, step +0.1)

```
18:15:18.184  Commands Loaded: 23        ← SET_PARAM 1 + 그룹 Z_MOVE 1 + (JUMP+LINE)×7 + 셀 Z_MOVE 6 + 꼬리 Z_MOVE 1
18:15:18.283  SET_PARAM speed=5.000 (cmd 1/23)
18:15:18.405 ~ 29.384  경계 flush 8회   ← SET_PARAM 1 + 그룹 Z_MOVE 1 + 셀 Z_MOVE 6 (꼬리는 최종 명령이라 별도 로그 없음)
18:15:31.325  Marking Finished/Stopped.
```

명령 수(23) 검산상 이 정상 완료 런에는 꼬리 Z_MOVE가 포함·실행된 것으로 추정된다. 그런데도 사용자는
미복귀를 관측한다 — 즉 결함은 "복귀 명령의 부재"가 아니라 **복귀 기준(baseZ)의 관리 방식**에 있다.

---

## 2. 근본 원인 (3가지 결함의 결합)

### 2.1 [주원인 — 래칫(ratchet) 드리프트] Stop/실패 시 꼬리 미실행 → 시작 Z가 영구 유실된다

복귀 명령이 **명령 스트림의 맨 끝에 데이터로만** 존재하므로, 꼬리에 도달하지 못하는 모든 경로에서
복귀가 통째로 소실된다:

- **Stop**: `Run()` 루프는 `m_stopFlag`에서 즉시 탈출(6차 P1 규약)하고, Z_MOVE 분기의 콜백 호출도
  `!m_stopFlag` 가드로 생략된다 → **Stop 시 Z는 정지 시점의 셀 Z에 그대로 남는다.**
  실증: 금일 18:13 런(9차 CIRCLE 교착)을 수동 Stop → 그 시점의 Z가 그대로 잔류.
- **생성/전송 실패, 보드 타임아웃** 등도 동일.

문제는 다음 런이다: 다음 런의 `baseZ = 그 시점 positions.Z` = **드리프트된 잔류 Z**. 즉 다음 런은
"드리프트된 위치"를 시작 Z로 오인해 충실히 그 위치로 복귀한다. **한 번이라도 꼬리가 실행되지 못하면
사용자의 원래 기준 Z는 어디에도 기록돼 있지 않아 영구히 유실**되고, 이후의 모든 정상 완료 런조차
"마지막(드리프트된) Z에서 끝나는" 것으로 관측된다. 사용자 보고("마지막 z 위치에서 끝난다")와 일치.

### 2.2 [부원인 — 기준값 취약성] baseZ가 "생성 시점의 폴링 값"이다

`positions.Z`는 주기 폴링으로 갱신되는 스토어 값이라, Process Start 직전에 Z가 움직였거나(조그/직전 런
정착 중) 폴링이 지연되면 **실제 물리 Z와 다른 값이 복귀 목표로 박제**된다. 복귀 기준은 명령 생성
시점의 스냅숏이 아니라 **Run 시작 시점의 실측**이어야 한다.

### 2.3 [부수 결함 — 같은 영역] REPEAT(Mark Times≥2) × Cumulative Z: pass 2부터 첫 셀 초점 이탈

생성기는 Z_MOVE를 `absoluteZ !== context.lastZ`일 때만 방출한다(중복 제거). 그룹 Z_MOVE(예: 103.556)
직후의 셀 0은 같은 값이라 **셀 0의 Z_MOVE가 생략**되는데, 이 중복 제거는 **선형 실행을 전제**한 것이다.
7차 REPEAT 블록은 드라이버가 블록을 **되감아 재실행**하므로, pass 2 시작 시점의 물리 Z는 이전 pass
마지막 셀의 Z(예: 104.156)이고 블록 안에 셀 0 Z_MOVE가 없어 **pass 2 이후의 첫 셀이 잘못된 Z(초점
이탈)에서 가공**된다. (9차 P3-1 "전 그룹 REPEAT 래핑"이 구현되면 반복 1회 그룹 외 모든 경로가 이
블록 실행을 타므로 함께 고쳐야 한다.)

---

## 3. 수정 계획

### 설계 원칙

> **"Run 종료 시 Z = Run 시작 시 Z" 불변식을, 스트림 데이터가 아니라 드라이버 경계에서 실측으로 강제한다.**
> 원인 조합(Stop/실패/폴링 지연)이 무엇이든 이 단일 지점이 최종 보정한다.

### P1 — [C++] Run 경계 실측 Z 캡처·복귀 (근본 수정)

| # | 수정 | 위치 |
|---|---|---|
| P1-1 | `HandleScannerRun`의 워커 람다에서 `g_Scanner->Run(...)` 호출 **직전** `startZ_mm = g_Z.GetPos() / unitMultiplier` **실측 캡처**(폴링 스토어 아님) + 로그 | `PortalRouterHandler.cpp` (Run 호출부 :1941~) |
| P1-2 | `Run()` 반환 **직후**(정상 완료·Stop·예외 공통의 단일 지점) `\|현재 실측 Z − startZ_mm\| > 0.005` 이면 기존 zMoveCallback과 동일한 이동+정착 로직으로 **시작 Z 복귀**. 이동·정착 로직은 로컬 람다로 추출해 zMoveCallback과 공유(DRY) + "Z restored to start" 로그 | 〃 |
| P1-3 | 안전 경계: 복귀 이동은 E-Stop/알람으로 모션이 비활성인 경우 MovAbs가 무시·실패해도 기존 1.5s 정착 타임아웃으로 자연 탈출(무한 대기 없음). 라우터 공통 경로이므로 SinoGalvo/Scanlab **양 드라이버 자동 커버** | 〃 |

- **Stop 시에도 복귀한다** — 이것이 2.1 래칫 드리프트의 원천 차단이다. (Stop = "가공 중단"이지 "축 동결"이
  아니며, 기존에도 Stop 후 갈보 센터 등 정리 동작이 있었다. 승인 시 이 정책 확인 요청.)
- 부작용 인지: 복귀는 `Run()` 내부의 idle 방송 **후**에 수행되므로 UI가 Completed로 바뀐 뒤 ~1초간 Z가
  마저 복귀한다(순수 표시 타이밍, 기능 무해). Run 시그니처 변경 없이 최소 침습으로 하는 대가 — 필요 시
  후속에서 idle 방송을 복귀 뒤로 옮기는 개선 가능.

### P2 — [TS] 프론트 꼬리 Z_MOVE 제거 (복귀 책임 단일화)

| # | 수정 | 위치 |
|---|---|---|
| P2-1 | `generate()`의 꼬리 Z_MOVE(:287-290) **제거** — 복귀 책임을 P1(실측)로 단일화. 유지 시 폴링 값(baseZ)으로 갔다가 P1이 실측 값으로 재이동하는 이중 이동이 생길 수 있다 | `ScannerGenerator.ts` |
| P2-2 | Object(G-Code) 모드는 무변경 — 스트림 내 복귀(`useGCodeGenerator.ts:1425-1429`, `baseWorkingZ`)가 이미 있고 컨트롤러 실행 모델상 자연스러움 | — |

### P3 — [TS] REPEAT × Cumulative Z 초점 이탈 수정 (§2.3)

| # | 수정 | 위치 |
|---|---|---|
| P3-1 | `generate()`에서 `REPEAT_BEGIN` 방출 직후 `context.lastZ = undefined` 리셋 → 블록 내 **첫 Z 요구 지점의 Z_MOVE가 항상 방출**되어 되감기 재실행 의미와 정합. (같은 값 Z_MOVE가 중복 실행돼도 제자리 이동 + 정착 확인뿐이라 무해) | `ScannerGenerator.ts` |

### P4 — 검증 (리빌드 후 실기)

| # | 시나리오 | 합격 기준 |
|---|---|---|
| T1 | Cumulative(+0.1)×7 매트릭스, 정상 완료 | 완료 후 Z DRO = 시작 Z(±0.005). 로그에 "Z restored to start" |
| T2 | 동일 가공 중 **Stop** | 정지 후 Z가 시작 Z로 복귀(래칫 차단). 재시작 정상 |
| T3 | **연속 5회 반복 실행**(완료 3회 + Stop 2회 섞어서) | 매회 종료 후 Z 동일 — 드리프트 0 |
| T4 | Mark Times 2 + Cumulative 매트릭스 | pass 2의 셀 0도 셀 0 Z에서 가공(로그의 Z_MOVE 시퀀스로 확인), 완료 후 시작 Z 복귀 |
| T5 | 색상 2그룹(Z 상이) 일반 도형 | 그룹별 Z 이동 정상, 완료 후 시작 Z 복귀 (§H 회귀 없음) |
| T6 | Object(G-Code) 모드 매트릭스 | 기존 스트림 복귀 동작 유지(회귀 없음) |

### 빌드/배포

- P1: C++(`PortalRouterHandler.cpp`) — **`.sln` 경유 msbuild**(exe 종료 후, LNK1104 주의).
- P2/P3: TS — `vite build` + `Bin\web` robocopy.
- P2(꼬리 제거)는 P1과 **동시 배포**해야 공백이 없다(신 프론트 + 구 exe 조합이면 복귀 부재).

---

## 4. 구현 현황 (2026-07-23 승인 후 구현 완료)

| 항목 | 상태 | 내용 |
|---|---|---|
| P1-1~3 | ✅ | `PortalRouterHandler.cpp` `HandleScannerRun`: 기존 zMoveCallback 본문을 `moveZAndSettle` 공용 람다로 추출(DRY, captureless → std::function 변환 무비용). Run 호출 직전 `startZ_mm = g_Z.GetPos()/unitMultiplier` 실측 캡처 → Run 반환 직후(정상/Stop/예외 공통) `\|endZ − startZ\| > 0.005mm`면 복귀 + "Z restored to start" 로그(LogManager). 라우터 공통 경로라 SinoGalvo/Scanlab 양쪽 커버 |
| P2-1 | ✅ | `ScannerGenerator.ts` `generate()`: 꼬리 Z_MOVE 제거(복귀 책임을 P1로 단일화). Object(G-Code) 모드는 무변경 |
| P3-1 | ✅ (설계 조정) | 구현 시점에 Issue9 P3-1(전 그룹 REPEAT 래핑)이 반영되어 있어, 계획의 "lastZ=undefined 리셋" 대신 **`IGenerationContext.forceNextZMove` 플래그**로 구현 — 리셋 방식은 다음 그룹 경계의 zBefore 판정(`lastZ ?? baseZ`)을 오염시킬 수 있기 때문. `REPEAT_BEGIN` 방출 직후 `repeat > 1`일 때 플래그를 세우고, 두 Z_MOVE 방출 지점(일반 도형 zOffset 분기·매트릭스 셀 분기)이 dedupe를 우회해 블록 첫 Z_MOVE를 강제 방출 후 플래그 소거. repeat=1은 되감기가 없어 강제하지 않음(명령 수 절약) |
| 빌드 | ✅ | `tsc` 오류 총 67건 = 전부 기존 부채(신규 0건). `vite build` + `Bin\web` robocopy 배포. `LASERnGRAPN.sln` msbuild Release x64 성공(`Bin\LASERnGRAPN.exe` 19:09 갱신) — **프론트/exe 동시 배포 충족** |
| 검증 | ⬜ 실기 | §P4의 T1~T6(정상 완료 복귀, Stop 복귀, Stop 섞은 연속 5회 드리프트 0, Mark Times 2+Cumulative pass 2 셀 0 초점, 색상 2그룹, Object 모드 회귀) 장비 수행 대기 |

---
최종 작성일: 2026-07-23 (계획 → 승인 → 구현 완료)
담당: Claude (AI Coding Assistant)
