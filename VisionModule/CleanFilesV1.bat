@echo on

rem /**
rem  * @file CleanVisionModule.bat
rem  * @brief VisionModule Build Artifacts Cleanup Script
rem  * @details Cleans up global build folders, VisionModule specific temp files,
rem  * and the Bin directory (preserving 'Config').
rem  * @author Assistant
rem  */

rem //=====================================
rem // LASERnGRAPN - VisionModule Cleanup
rem //=====================================

rem /**
rem  * @step 1. Clean Top-level Build Directories
rem  */
if exist Release rd Release /s /q
if exist Debug rd Debug /s /q
if exist ipch rd ipch /s /q
if exist x64 rd x64 /s /q
if exist .vs rd .vs /s /q

rem /**
rem  * @step 2. Clean Bin Folder (Preserve Config)
rem  * @desc Deletes all files in 'Bin' and all subfolders EXCEPT 'Config'.
rem  */
if exist Bin (
    pushd Bin
    
    rem -- Delete all files (exe, log, dll, etc.) in Bin root --
    del /q *.*

    rem -- Iterate subdirectories and delete if not 'Config' --
    for /d %%D in (*) do (
        if /i not "%%D"=="Config" (
            rd /s /q "%%D"
        )
    )
    popd
)

rem /**
rem  * @step 3. Clean VisionModule Temporary Files
rem  * @desc Removes intermediate files specific to VisionModule.
rem  */
del VisionModule\*.pch /s /q
del VisionModule\*.ncb /s /q
del VisionModule\*.opt /s /q
del VisionModule\*.plg /s /q
del VisionModule\*.bsc /s /q
del VisionModule\*.ilk /s /q
del VisionModule\*.tgz /s /q
del VisionModule\*.aps /s /q
del VisionModule\*.clw /s /q
del VisionModule\*.pdb /s /q
del VisionModule\*.sdf /s /q
rem del VisionModule\*.user /s /q
del VisionModule\*.bak /s /q

rem /**
rem  * @step 4. Clean VisionModule Build Output Folders
rem  */
if exist VisionModule\Debug rd VisionModule\Debug /s /q
if exist VisionModule\Release rd VisionModule\Release /s /q
if exist VisionModule\x64 rd VisionModule\x64 /s /q

rem // Script Complete