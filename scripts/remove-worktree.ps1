# =====================================================================
# worktree 안전 제거 스크립트
# 사용: .\scripts\remove-worktree.ps1 -Name vision-blob [-Force]
#
# ⚠ 절대 Remove-Item -Recurse 로 worktree 를 지우지 마십시오.
#   PowerShell 은 junction 내부로 따라 들어가 원본 SDK(external\cef 958MB)
#   를 삭제합니다. git worktree remove 는 junction 을 링크로만 제거합니다.
# =====================================================================
param(
    [Parameter(Mandatory)][string]$Name,
    [switch]$Force                            # 미커밋 변경이 있어도 제거
)
$ErrorActionPreference = 'Stop'
$Main = Split-Path -Parent $PSScriptRoot
$Wt = "$(Split-Path -Parent $Main)\LW2-3.wt\$Name"

if (-not (Test-Path $Wt)) { throw "없음: $Wt" }

# 미커밋 변경 경고
$dirty = git -C $Wt status --porcelain
if ($dirty -and -not $Force) {
    Write-Host "미커밋 변경이 있습니다:" -ForegroundColor Yellow
    $dirty | ForEach-Object { "  $_" }
    throw "커밋/핸드오프 후 다시 실행하거나 -Force 를 사용하십시오."
}

$args = @('worktree', 'remove', $Wt)
if ($Force) { $args += '--force' }
git -C $Main @args
if ($LASTEXITCODE -ne 0) { throw "git worktree remove 실패" }
git -C $Main worktree prune

# 원본 SDK 무사 확인
$ok = Test-Path "$Main\external\cef\lib\Release\libcef.dll",
                "$Main\VisionModule\FeatureLibrary\OpenCV\build\x64\vc16\bin\opencv_world4120.dll"
if ($ok -contains $false) {
    Write-Host "경고: 원본 SDK 파일이 확인되지 않습니다! docs\EXTERNAL_DEPENDENCIES.md 로 복원하십시오." -ForegroundColor Red
} else {
    Write-Host "제거 완료. 원본 SDK 무사 확인됨." -ForegroundColor Green
}
