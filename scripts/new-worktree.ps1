# =====================================================================
# 병렬 세션용 worktree 생성 스크립트
# 사용: .\scripts\new-worktree.ps1 -Name vision-blob -Branch feat/vision/blob-detect
# 근거: docs\plans\Parallel_Claude_Sessions_Plan.md Phase 1
# =====================================================================
param(
    [Parameter(Mandatory)][string]$Name,     # worktree 폴더명 (짧게, 예: vision-blob)
    [Parameter(Mandatory)][string]$Branch,   # 브랜치명 (예: feat/vision/blob-detect)
    [switch]$SkipNpm                         # Portal 작업이 없으면 npm ci 생략
)
$ErrorActionPreference = 'Stop'
$Main = Split-Path -Parent $PSScriptRoot     # 이 스크립트 기준 저장소 루트
$WtRoot = "$(Split-Path -Parent $Main)\LW2-3.wt"
$Wt = "$WtRoot\$Name"

if (Test-Path $Wt) { throw "이미 존재: $Wt" }

# SDK 원본 존재 확인 (junction 대상)
foreach ($sdk in @("$Main\external\cef", "$Main\VisionModule\FeatureLibrary\OpenCV")) {
    if (-not (Test-Path $sdk)) { throw "SDK 없음: $sdk`n먼저 docs\EXTERNAL_DEPENDENCIES.md 1장으로 복원하십시오." }
}

Write-Host "[1/4] worktree 생성: $Wt (브랜치 $Branch, 기준 origin/main)"
git -C $Main fetch origin main
git -C $Main worktree add $Wt -b $Branch origin/main
if ($LASTEXITCODE -ne 0) { throw "git worktree add 실패" }

Write-Host "[2/4] SDK junction 연결 (복사 아님 — 메인 체크아웃과 물리 폴더 공유)"
New-Item -ItemType Junction -Path "$Wt\external\cef" `
         -Target "$Main\external\cef" | Out-Null
New-Item -ItemType Junction -Path "$Wt\VisionModule\FeatureLibrary\OpenCV" `
         -Target "$Main\VisionModule\FeatureLibrary\OpenCV" | Out-Null

if (-not $SkipNpm) {
    Write-Host "[3/4] Portal 의존성 설치 (worktree별 독립 node_modules)"
    Push-Location "$Wt\Portal"
    npm ci --prefer-offline
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm ci 실패" }
    Pop-Location
} else {
    Write-Host "[3/4] npm ci 생략 (-SkipNpm)"
}

Write-Host "[4/4] 확인"
$ok = Test-Path "$Wt\external\cef\lib\Release\libcef.dll",
                "$Wt\VisionModule\FeatureLibrary\OpenCV\build\x64\vc16\bin\opencv_world4120.dll"
if ($ok -contains $false) { throw "junction 검증 실패" }

Write-Host ""
Write-Host "완료. 다음 명령으로 새 VS Code 창을 여십시오:" -ForegroundColor Green
Write-Host "  code $Wt"
Write-Host ""
Write-Host "정리는 반드시:  .\scripts\remove-worktree.ps1 -Name $Name" -ForegroundColor Yellow
Write-Host "(Remove-Item -Recurse 금지 — junction 을 따라 원본 SDK 가 삭제됩니다)" -ForegroundColor Yellow
