@echo off
rem =====================================================================
rem Portal 웹 빌드 스크립트
rem Portal/dist 는 git 에서 제외되어 있으므로 (병렬 세션 충돌 방지),
rem C++ 빌드(LASERnGRAPN post-build 의 robocopy Portal\dist -> Bin\web)
rem 이전에 dist 가 없거나 오래됐으면 이 스크립트를 실행하십시오.
rem 근거: docs\plans\Parallel_Claude_Sessions_Plan.md Phase 0-1
rem =====================================================================
setlocal
cd /d "%~dp0Portal"

if not exist node_modules (
    echo [build-portal] node_modules 없음 - npm ci 실행
    call npm ci
    if errorlevel 1 exit /b 1
)

echo [build-portal] npm run build
call npm run build
if errorlevel 1 exit /b 1

echo [build-portal] 완료: Portal\dist
endlocal
