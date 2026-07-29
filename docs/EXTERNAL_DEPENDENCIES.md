# 외부 의존성 (Git 추적 제외 항목) 안내

작성일: 2026-07-29

## 1. 배경

GitHub는 **파일 1개당 100MB**를 초과하면 push를 거부합니다(50MB 초과 시 경고).
본 저장소에는 CEF/OpenCV 서드파티 바이너리가 포함되어 있어 아래 4개 파일이 제한을 초과했습니다.

| 파일 | 크기 |
|---|---|
| `external/cef/lib/Debug/libcef.dll` | 348.7 MB |
| `VisionModule/FeatureLibrary/OpenCV/build/x64/vc16/bin/opencv_world4120d.pdb` | 264.4 MB |
| `external/cef/lib/Release/libcef.dll` | 236.3 MB |
| `VisionModule/FeatureLibrary/OpenCV/build/x64/vc16/bin/opencv_world4120d.dll` | 121.4 MB |

따라서 해당 서드파티 SDK 전체를 Git 추적에서 제외하고, **별도 경로로 배포**하는 방식으로 전환했습니다.

## 2. 제외 대상

`.gitignore`에 등록된 항목:

```
external/cef/
VisionModule/FeatureLibrary/OpenCV/
.claude/settings.local.json
```

| 대상 | 내용 | 파일 수 | 용량 |
|---|---|---|---|
| `external/cef/` | CEF (Chromium Embedded Framework) 바이너리 SDK | 543 | 957.8 MB |
| `VisionModule/FeatureLibrary/OpenCV/` | OpenCV 4.12.0 prebuilt 바이너리 | 356 | 523.2 MB |
| `.claude/settings.local.json` | Claude Code 개인 로컬 설정 | 1 | - |
| **합계** | | **900** | **약 1.48 GB** |

> 제외된 **전체 파일 목록(경로 + 바이트 크기)** 은 [excluded-files.txt](excluded-files.txt) 에 저장되어 있습니다. 세팅 후 파일 누락 검증에 사용하세요.

### 2.1 버전 정보

| SDK | 버전 |
|---|---|
| CEF | `141.0.8+g8365640+chromium-141.0.7390.108` (Windows 64bit) |
| Chromium | 141.0.7390.108 |
| OpenCV | 4.12.0 (VC16 / x64) |

## 3. 필요한 폴더 구조

빌드 스크립트(`LASERnGRAPN.vcxproj`, `VisionModule.vcxproj`)가 아래 **정확한 경로**를 참조하므로 구조가 반드시 일치해야 합니다.

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

폴더만 올바르게 배치하면 **빌드 후 이벤트가 DLL/리소스를 출력 폴더로 자동 복사**하므로 추가 작업은 없습니다.

---

## 4. 배포 방법 A — 사내 공유 드라이브 (권장)

CEF는 공식 배포본을 그대로 쓸 수 없습니다. `libcef_dll_wrapper.lib`(Debug 94MB / Release 80MB)는 배포본에 **소스만 포함**되어 있어 CMake + Visual Studio로 직접 빌드해야 합니다. 팀원마다 이 과정을 반복하면 빌드 옵션 차이로 링크 오류가 발생할 수 있으므로, **한 번 빌드한 결과물을 공유 드라이브로 배포**하는 방식이 가장 안전합니다.

### 4-1. 배포 담당자: 패키지 생성 (최초 1회 / SDK 갱신 시)

현재 정상 동작하는 로컬 폴더를 그대로 압축합니다.

```powershell
cd D:\000.Git_Project\LW2-3

# CEF 패키지
Compress-Archive -Path external\cef `
  -DestinationPath "\\사내NAS\공유\LW2-3\deps\cef_141.0.8_win64.zip" -Force

# OpenCV 패키지
Compress-Archive -Path VisionModule\FeatureLibrary\OpenCV `
  -DestinationPath "\\사내NAS\공유\LW2-3\deps\opencv_4.12.0_vc16_x64.zip" -Force
```

> 1.5GB를 압축하므로 수 분 소요됩니다. 압축 없이 폴더 통째로 복사해두어도 무방합니다(오히려 배포가 빠름).

권장 공유 드라이브 구조:

```
\\사내NAS\공유\LW2-3\deps\
├─ README.txt                          (버전 · 적용 경로 안내)
├─ cef_141.0.8_win64.zip
└─ opencv_4.12.0_vc16_x64.zip
```

### 4-2. 팀원: 세팅 (clone 직후 1회)

```powershell
# 1) 저장소 clone
git clone https://github.com/RedJayden/LW2-3.git D:\000.Git_Project\LW2-3
cd D:\000.Git_Project\LW2-3

# 2) 공유 드라이브에서 의존성 복원
$DEPS = "\\사내NAS\공유\LW2-3\deps"

New-Item -ItemType Directory -Force -Path external, VisionModule\FeatureLibrary | Out-Null
Expand-Archive -Path "$DEPS\cef_141.0.8_win64.zip"        -DestinationPath external -Force
Expand-Archive -Path "$DEPS\opencv_4.12.0_vc16_x64.zip"   -DestinationPath VisionModule\FeatureLibrary -Force

# 3) 배치 확인
Test-Path external\cef\lib\Release\libcef.dll,
         external\cef\include\cef_version.h,
         VisionModule\FeatureLibrary\OpenCV\build\x64\vc16\bin\opencv_world4120.dll
```

세 항목이 모두 `True`면 `LASERnGRAPN.sln`을 열어 바로 빌드할 수 있습니다.

---

## 5. 배포 방법 B — 공식 배포처에서 직접 다운로드

사내 공유 드라이브를 쓸 수 없는 경우(외부 인력, 신규 PC 등)의 절차입니다.

### 5-1. OpenCV 4.12.0

1. https://github.com/opencv/opencv/releases/tag/4.12.0 에서 `opencv-4.12.0-windows.exe` 다운로드
2. 임의 경로에 압축 해제 → `opencv\build\` 생성됨
3. 아래와 같이 복사 (배포본 구조와 저장소 구조가 동일하므로 그대로 복사)

```powershell
$SRC = "C:\Temp\opencv\build"      # 압축 해제 경로
$DST = "D:\000.Git_Project\LW2-3\VisionModule\FeatureLibrary\OpenCV\build"

New-Item -ItemType Directory -Force -Path $DST | Out-Null
Copy-Item "$SRC\include" -Destination $DST -Recurse -Force
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

`docs/excluded-files.txt`와 실제 파일을 대조해 누락 항목을 확인합니다.

```powershell
cd D:\000.Git_Project\LW2-3
$missing = Get-Content docs\excluded-files.txt |
  Where-Object { $_ -notmatch '^\s*#' -and $_.Trim() } |
  ForEach-Object { ($_ -split '\s+', 3)[-1] } |
  Where-Object { -not (Test-Path $_.Replace('/', '\')) }

if ($missing) { "누락 $($missing.Count)건:"; $missing } else { "모든 파일 정상" }
```

## 7. 주의사항

- **CEF / OpenCV 버전을 올릴 때**는 공유 드라이브 패키지와 이 문서의 버전 표를 함께 갱신하세요. 저장소에 파일이 없으므로 Git 히스토리로는 버전 변경 이력을 추적할 수 없습니다.
- `external/`, `VisionModule/FeatureLibrary/OpenCV/` 하위 파일은 `.gitignore` 처리되어 있어 `git add` 해도 무시됩니다. 의도적으로 커밋해야 할 파일이 생기면 `git add -f`가 필요하지만, 100MB 제한에 다시 걸리지 않는지 반드시 확인하세요.
- 향후 대용량 파일을 저장소에 꼭 포함해야 한다면 Git LFS를 검토하되, GitHub 무료 할당량은 저장 1GB / 월 대역폭 1GB이므로 유료 데이터팩이 필요합니다.
