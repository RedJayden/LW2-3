@echo on

rem /**
rem  * @file CleanFilesV1.bat
rem  * @brief Project Build Artifacts Cleanup Script
rem  * @details Cleans up intermediate build files and output binaries.
rem  * Preserves specific runtime folders ('Bin/Config', 'Bin/DLLS').
rem  * @author Assistant
rem  */

rem //=====================================
rem // LASERnGRAPN Cleanup Routine
rem //=====================================

rem /**
rem  * @step 1. Clean Top-level Build Directories
rem  * @desc Removes standard VS build folders.
rem  */
if exist Release rd Release /s /q
if exist Debug rd Debug /s /q
if exist ipch rd ipch /s /q
if exist x64 rd x64 /s /q
if exist .vs rd .vs /s /q

rem /**
rem  * @step 2. Clean Bin Folder (Pattern: Composite Filter)
rem  * @desc Deletes all files/folders in 'Bin' EXCEPT 'Config' AND 'DLLS'.
rem  */
if exist Bin (
    pushd Bin
    
    rem -- Delete all files in the root of Bin (e.g., old .exe, .pdb) --
    del /q *.*

    rem -- Iterate through all subdirectories --
    for /d %%D in (*) do (
        rem -- Filter 1: Check if NOT 'Config' --
        if /i not "%%D"=="Config" (
            rem -- Filter 2: Check if NOT 'DLLS' --
            if /i not "%%D"=="DLLS" (
			rem -- Filter 2: Check if NOT 'Recipe' --
			    if /i not "%%D"=="Recipe" (
				rem -- Filter 2: Check if NOT 'Image' --
					if /i not "%%D"=="Image" (
						rem -- If neither, delete the folder --
						rd /s /q "%%D"
					)
				)
            )
        )
    )
    
    popd
)

rem /**
rem  * @step 3. Clean Project Specific Temporary Files
rem  * @desc Removes intermediate files from the source directory.
rem  */
del LASERnGRAPN\*.pch /s /q
del LASERnGRAPN\*.ncb /s /q
del LASERnGRAPN\*.opt /s /q
del LASERnGRAPN\*.plg /s /q
del LASERnGRAPN\*.bsc /s /q
del LASERnGRAPN\*.ilk /s /q
del LASERnGRAPN\*.tgz /s /q
del LASERnGRAPN\*.aps /s /q
del LASERnGRAPN\*.clw /s /q
del LASERnGRAPN\*.pdb /s /q
rem del LASERnGRAPN\*.user /s /q
del LASERnGRAPN\*.bak /s /q

rem /**
rem  * @step 4. Clean Project Build Output Folders
rem  */
if exist LASERnGRAPN\Debug rd LASERnGRAPN\Debug /s /q
if exist LASERnGRAPN\Release rd LASERnGRAPN\Release /s /q
if exist LASERnGRAPN\x64 rd LASERnGRAPN\x64 /s /q

rem // Script Complete