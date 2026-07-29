# 외부 의존성 (Git 추적 제외 항목) 안내

작성일: 2026-07-29 · 대상 저장소: https://github.com/RedJayden/LW2-3

CEF / OpenCV 바이너리 SDK(약 1.48GB)는 GitHub 파일 크기 제한 때문에 Git에서 제외되어 있습니다.
**clone 직후에는 해당 폴더가 없으므로 아래 절차로 복원해야 빌드됩니다.**

---

## 1. 빠른 시작 — 신규 팀원 세팅

사내 공유 드라이브 `X:\300.LW2-3` 에 패키지가 준비되어 있습니다. clone 후 **아래 두 줄이면 세팅이 끝납니다.**

```powershell
Expand-Archive "X:\300.LW2-3\cef_141.0.8_win64.zip"      -DestinationPath external -Force
Expand-Archive "X:\300.LW2-3\opencv_4.12.0_vc16_x64.zip" -DestinationPath VisionModule\FeatureLibrary -Force
```

### 전체 절차

```powershell
# 1) 저장소 clone (경로는 자유롭게 변경 가능)
git clone https://github.com/RedJayden/LW2-3.git D:\000.Git_Project\LW2-3
cd D:\000.Git_Project\LW2-3

# 2) 대상 폴더 준비 (clone 직후에는 존재하지 않음)
New-Item -ItemType Directory -Force -Path external, VisionModule\FeatureLibrary | Out-Null

# 3) 공유 드라이브에서 의존성 복원 (합계 약 1.5GB, 1분 내외)
Expand-Archive "X:\300.LW2-3\cef_141.0.8_win64.zip"      -DestinationPath external -Force
Expand-Archive "X:\300.LW2-3\opencv_4.12.0_vc16_x64.zip" -DestinationPath VisionModule\FeatureLibrary -Force

# 4) 배치 확인 — 3개 모두 True 여야 함
Test-Path external\cef\lib\Release\libcef.dll,
         external\cef\include\cef_version.h,
         VisionModule\FeatureLibrary\OpenCV\build\x64\vc16\bin\opencv_world4120.dll
```

세 항목이 모두 `True`면 `LASERnGRAPN.sln`을 열어 바로 빌드할 수 있습니다.
zip 루트가 각각 `cef\` / `OpenCV\` 이므로 위 명령만으로 `external\cef\`, `VisionModule\FeatureLibrary\OpenCV\` 에 정확히 배치됩니다.

**빌드 후 이벤트가 DLL/리소스를 출력 폴더로 자동 복사**하므로 별도의 경로 설정이나 환경 변수 작업은 필요 없습니다.

> 공유 드라이브를 사용할 수 없는 환경(외부 인력, 망 분리 PC 등)이라면 [5장](#5-대안--공식-배포처에서-직접-다운로드)을 따르세요. 다만 CEF는 직접 빌드 과정이 필요해 시간이 훨씬 오래 걸립니다.

### 배포 패키지 현황

| 파일 | 압축 크기 | 원본 | 파일 수 |
|---|---|---|---|
| `X:\300.LW2-3\cef_141.0.8_win64.zip` | 368.3 MB | 957.8 MB | 543 |
| `X:\300.LW2-3\opencv_4.12.0_vc16_x64.zip` | 125.1 MB | 523.2 MB | 357 |
| `X:\300.LW2-3\README.txt` | 3 KB | — | — |

두 패키지 모두 실제 `Expand-Archive` 복원 테스트로 **파일 수·총 바이트 완전 일치**를 확인했으며, `libcef.dll`(Release)은 SHA256 해시까지 대조했습니다.

---

## 2. 배경 — 왜 Git에서 제외했는가

GitHub는 **파일 1개당 100MB**를 초과하면 push를 거부합니다(50MB 초과 시 경고). 아래 4개 파일이 제한을 초과해 push가 차단되었습니다.

| 파일 | 크기 |
|---|---|
| `external/cef/lib/Debug/libcef.dll` | 348.7 MB |
| `VisionModule/FeatureLibrary/OpenCV/build/x64/vc16/bin/opencv_world4120d.pdb` | 264.4 MB |
| `external/cef/lib/Release/libcef.dll` | 236.3 MB |
| `VisionModule/FeatureLibrary/OpenCV/build/x64/vc16/bin/opencv_world4120d.dll` | 121.4 MB |

Git LFS도 검토했으나 GitHub 무료 할당량이 저장 1GB / 월 대역폭 1GB로 대상 용량(1.48GB)에 미치지 못해 유료 데이터팩이 필요합니다. 따라서 **해당 SDK 전체를 Git에서 제외하고 공유 드라이브로 배포**하는 방식을 채택했습니다.

조치 결과 저장소는 1.67GB → **190.1MB**, 최대 파일은 348.7MB → **13.8MB** 로 줄었습니다.

## 3. 제외 대상

`.gitignore` 등록 항목:

```
external/cef/
VisionModule/FeatureLibrary/OpenCV/
.claude/settings.local.json
```

| 대상 | 내용 | 파일 수 | 용량 |
|---|---|---|---|
| `external/cef/` | CEF (Chromium Embedded Framework) 바이너리 SDK | 543 | 957.8 MB |
| `VisionModule/FeatureLibrary/OpenCV/` | OpenCV 4.12.0 prebuilt 바이너리 | 357 | 523.2 MB |
| `.claude/settings.local.json` | Claude Code 개인 로컬 설정 | 1 | — |
| **합계** | | **901** | **약 1.48 GB** |

> 제외된 **전체 파일 목록(경로 + 바이트 크기)** 은 [excluded-files.txt](excluded-files.txt) 에 있습니다. 세팅 후 누락 검증에 사용하세요 → [6장](#6-세팅-검증)

### 3.1 버전 정보

| SDK | 버전 |
|---|---|
| CEF | `141.0.8+g8365640+chromium-141.0.7390.108` (Windows 64bit) |
| Chromium | 141.0.7390.108 |
| OpenCV | 4.12.0 (VC16 / x64) |

## 4. 필요한 폴더 구조

빌드 스크립트(`LASERnGRAPN.vcxproj`, `VisionModule.vcxproj`)가 아래 **정확한 경로**를 참조하므로 구조가 반드시 일치해야 합니다. 1장의 복원 절차를 그대로 따르면 이 구조가 만들어집니다.

```
LW2-3/
├─ external/
│  └─ cef/
│     ├─ include/                     ← AdditionalIncludeDirectories
│     ├─ lib/
│     │  ├─ Debug/                    ← AdditionalLibraryDirectories ($(Configuration))
│     │  └─ Release/
│     └─ Resources/
│        ├─ locales/
│        ├─ chrome_100_percent.pak
│        ├─ chrome_200_percent.pak
│        ├─ icudtl.dat
│        └─ resources.pak
└─ VisionModule/
   └─ FeatureLibrary/
      └─ OpenCV/
         └─ build/
            ├─ include/               ← IncludePath
            └─ x64/
               └─ vc16/
                  ├─ bin/             ← LibraryPath + 빌드 후 DLL 복사 원본
                  └─ lib/             ← LibraryPath
```

참조 위치:
- [LASERnGRAPN.vcxproj:128](../LASERnGRAPN/LASERnGRAPN.vcxproj#L128) — CEF include
- [LASERnGRAPN.vcxproj:138](../LASERnGRAPN/LASERnGRAPN.vcxproj#L138) — CEF lib
- [LASERnGRAPN.vcxproj:145-147](../LASERnGRAPN/LASERnGRAPN.vcxproj#L145-L147) — CEF 바이너리/리소스를 `$(OutDir)`로 xcopy
- [VisionModule.vcxproj:144-145](../VisionModule/VisionModule/VisionModule.vcxproj#L144-L145) — OpenCV include/lib
- [VisionModule.vcxproj:246](../VisionModule/VisionModule/VisionModule.vcxproj#L246) — OpenCV DLL 복사

---

## 5. 대안 — 공식 배포처에서 직접 다운로드

공유 드라이브 `X:` 에 접근할 수 없는 경우의 절차입니다. **가능하면 1장(공유 드라이브)을 사용하세요.** CEF는 공식 배포본에 `libcef_dll_wrapper.lib`(Debug 94MB / Release 80MB)가 **소스로만 포함**되어 CMake + Visual Studio 빌드가 필요하고, 빌드 옵션 차이로 링크 오류가 발생할 수 있습니다.

### 5-1. OpenCV 4.12.0

1. https://github.com/opencv/opencv/releases/tag/4.12.0 에서 `opencv-4.12.0-windows.exe` 다운로드
2. 임의 경로에 압축 해제 → `opencv\build\` 생성됨
3. 배포본과 저장소 구조가 동일하므로 그대로 복사

```powershell
$SRC = "C:\Temp\opencv\build"      # 압축 해제 경로
$DST = "D:\000.Git_Project\LW2-3\VisionModule\FeatureLibrary\OpenCV\build"

New-Item -ItemType Directory -Force -Path $DST | Out-Null
Copy-Item "$SRC\include"  -Destination $DST            -Recurse -Force
Copy-Item "$SRC\x64\vc16" -Destination "$DST\x64\vc16" -Recurse -Force
```

### 5-2. CEF 141.0.8

1. https://cef-builds.spotifycdn.com/index.html 에서 브랜치 **141** 선택 →
   `cef_binary_141.0.8+g8365640+chromium-141.0.7390.108_windows64.tar.bz2` 다운로드
   (버전이 정확히 일치해야 합니다. Chromium 마이너 버전이 달라도 ABI가 깨집니다.)
2. 압축 해제 후 **`libcef_dll_wrapper` 를 직접 빌드**

```powershell
cd C:\Temp\cef_binary_141.0.8+g8365640+chromium-141.0.7390.108_windows64
cmake -G "Visual Studio 17 2022" -A x64 -B build .
cmake --build build --config Release --target libcef_dll_wrapper
cmake --build build --config Debug   --target libcef_dll_wrapper
```

3. 저장소 구조에 맞게 재배치 (배포본과 폴더 구조가 다르므로 아래 매핑을 따를 것)

| 배포본 경로 | 저장소 경로 |
|---|---|
| `include\` | `external\cef\include\` |
| `Release\*` (dll, bin, lib) | `external\cef\lib\Release\` |
| `Debug\*` (dll, bin, lib) | `external\cef\lib\Debug\` |
| `build\libcef_dll_wrapper\Release\libcef_dll_wrapper.lib` | `external\cef\lib\Release\` |
| `build\libcef_dll_wrapper\Debug\libcef_dll_wrapper.lib` | `external\cef\lib\Debug\` |
| `Resources\*` (pak, dat, locales) | `external\cef\Resources\` |

```powershell
$CEF = "C:\Temp\cef_binary_141.0.8+g8365640+chromium-141.0.7390.108_windows64"
$DST = "D:\000.Git_Project\LW2-3\external\cef"

New-Item -ItemType Directory -Force -Path "$DST\include","$DST\lib\Release","$DST\lib\Debug","$DST\Resources" | Out-Null
Copy-Item "$CEF\include\*"    "$DST\include\"     -Recurse -Force
Copy-Item "$CEF\Release\*"    "$DST\lib\Release\" -Recurse -Force
Copy-Item "$CEF\Debug\*"      "$DST\lib\Debug\"   -Recurse -Force
Copy-Item "$CEF\Resources\*"  "$DST\Resources\"   -Recurse -Force
Copy-Item "$CEF\build\libcef_dll_wrapper\Release\libcef_dll_wrapper.lib" "$DST\lib\Release\" -Force
Copy-Item "$CEF\build\libcef_dll_wrapper\Debug\libcef_dll_wrapper.lib"   "$DST\lib\Debug\"   -Force
```

---

## 6. 세팅 검증

[excluded-files.txt](excluded-files.txt)(900개 파일 목록)와 실제 파일을 대조해 누락을 확인합니다.

```powershell
cd D:\000.Git_Project\LW2-3
$missing = Get-Content docs\excluded-files.txt -Encoding UTF8 |
  Where-Object { $_ -notmatch '^\s*#' -and $_.Trim() } |
  ForEach-Object { ($_ -split '\s+', 3)[-1] } |
  Where-Object { -not (Test-Path -LiteralPath $_.Replace('/', '\')) }

if ($missing) { "누락 $($missing.Count)건:"; $missing } else { "모든 파일 정상" }
```

> `-Encoding UTF8` 과 `-LiteralPath` 는 생략하지 마세요. 목록에 `OpenCV – 4.12.0.txt`(en-dash 포함) 처럼 비ASCII 파일명이 있어 생략 시 오탐이 발생합니다.

---

## 7. 배포 담당자 — 패키지 생성 (최초 1회 / SDK 갱신 시)

정상 빌드가 확인된 로컬 폴더를 그대로 압축합니다. .NET `ZipFile` API를 사용하며, `Compress-Archive` 보다 빠르고(각 1분 이내) 항목명 인코딩을 UTF-8로 명시할 수 있습니다.

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$L = [System.IO.Compression.CompressionLevel]::Optimal
$U = [System.Text.Encoding]::UTF8

# CEF 패키지 (zip 루트 = cef\)
[System.IO.Compression.ZipFile]::CreateFromDirectory(
  "D:\000.Git_Project\LW2-3\external",
  "X:\300.LW2-3\cef_141.0.8_win64.zip", $L, $false, $U)

# OpenCV 패키지 (zip 루트 = OpenCV\)
[System.IO.Compression.ZipFile]::CreateFromDirectory(
  "D:\000.Git_Project\LW2-3\VisionModule\FeatureLibrary",
  "X:\300.LW2-3\opencv_4.12.0_vc16_x64.zip", $L, $false, $U)
```

> **압축 대상은 `cef` / `OpenCV` 의 _상위 폴더_ 입니다.** `includeBaseDirectory=$false` 와 조합되어 zip 루트가 `cef\` / `OpenCV\` 가 되며, 이래야 1장의 `Expand-Archive` 경로와 맞습니다. (`external\`, `VisionModule\FeatureLibrary\` 하위에는 각각 해당 폴더 하나만 존재합니다.)

> **`tar.exe` 는 사용하지 마세요.** Windows 기본 탑재 bsdtar는 zip 생성 시 항목명을 현재 로캘로 인코딩하며 UTF-8 옵션(`zip:encoding`)을 지원하지 않습니다. 실제로 `OpenCV – 4.12.0.txt`(en-dash 포함)가 `OpenCV ? 4.12.0.txt` 로 손상되어, 복원 시 `Expand-Archive` 가 해당 파일에서 "파일 이름 구문이 잘못되었습니다" 오류로 중단됩니다.

공유 드라이브 구조:

```
X:\300.LW2-3\
├─ README.txt                          (버전 · 적용 경로 · 세팅 절차)
├─ cef_141.0.8_win64.zip
└─ opencv_4.12.0_vc16_x64.zip
```

### 7-1. SDK 버전 갱신 시 체크리스트

저장소에 파일이 없으므로 **Git 히스토리로는 SDK 버전 변경 이력을 추적할 수 없습니다.** 아래를 반드시 병행하세요.

1. `X:\300.LW2-3\` 에 새 버전 zip 생성 (파일명에 버전 포함)
2. `X:\300.LW2-3\README.txt` 버전·파일명 갱신
3. 이 문서의 버전 표([3.1](#31-버전-정보))와 1장 명령어의 zip 파일명 갱신
4. `docs\excluded-files.txt` 재생성 (아래)
5. 팀 공지 — 기존 팀원도 복원 절차를 다시 수행해야 합니다

```powershell
# excluded-files.txt 재생성
cd D:\000.Git_Project\LW2-3
$root = (Get-Location).Path
$items = @('external\cef','VisionModule\FeatureLibrary\OpenCV') |
  ForEach-Object { Get-ChildItem $_ -Recurse -File } |
  ForEach-Object { [PSCustomObject]@{ Size=$_.Length; Path=$_.FullName.Substring($root.Length+1).Replace('\','/') } } |
  Sort-Object Path

$out  = @("# Git 추적 제외 파일 목록 (LW2-3)", "# 생성일: $(Get-Date -Format 'yyyy-MM-dd')")
$out += "# 대상  : external/cef/, VisionModule/FeatureLibrary/OpenCV/"
$out += "# 총 {0}개 파일 / {1:N1} MB" -f $items.Count, (($items | Measure-Object Size -Sum).Sum/1MB)
$out += "# 형식  : <크기(bytes)>  <경로>"
$out += "# 검증  : docs/EXTERNAL_DEPENDENCIES.md 6장 참고", ""
$out += ($items | ForEach-Object { "{0,12}  {1}" -f $_.Size, $_.Path })
Set-Content -Path docs\excluded-files.txt -Value $out -Encoding UTF8
```

> 이 목록은 반드시 **디스크 기준**으로 생성하세요. `git ls-tree` 는 비ASCII 경로를 `"...\342\200\223..."` 형태로 이스케이프해 출력하므로 필터링 과정에서 누락됩니다(실제로 `OpenCV – 4.12.0.txt` 1건이 빠졌던 이력이 있습니다).

## 8. 주의사항

- `external/`, `VisionModule/FeatureLibrary/OpenCV/` 하위 파일은 `.gitignore` 처리되어 `git add` 해도 무시됩니다. 의도적으로 커밋해야 할 파일이 생기면 `git add -f` 가 필요하지만, 100MB 제한에 다시 걸리지 않는지 반드시 확인하세요.
- SDK 폴더를 임의로 수정하지 마세요. 개인 PC에서만 반영되고 다른 팀원에게 전파되지 않아 재현 불가능한 빌드 차이를 만듭니다. 변경이 필요하면 배포 담당자에게 요청해 패키지 자체를 갱신해야 합니다.
- 향후 대용량 파일을 저장소에 꼭 포함해야 한다면 Git LFS를 검토하되, GitHub 무료 할당량(저장 1GB / 월 대역폭 1GB)을 초과하므로 유료 데이터팩이 필요합니다.
