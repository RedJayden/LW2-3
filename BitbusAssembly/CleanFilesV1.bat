@echo on

rem //=====================================
rem // BitbusAssembly		             //
rem //=====================================

rd Release /s /q
rd Debug /s /q
rd ipch /s /q
rd x64 /s /q
rd .vs /s /q

del *.sdf /s /q

del BitbusAssembly\*.pch /s /q
del BitbusAssembly\*.ncb /s /q
del BitbusAssembly\*.opt /s /q
del BitbusAssembly\*.plg /s /q
del BitbusAssembly\*.bsc /s /q
del BitbusAssembly\*.ilk /s /q
del BitbusAssembly\*.tgz /s /q
del BitbusAssembly\*.aps /s /q
del BitbusAssembly\*.clw /s /q
del BitbusAssembly\*.pdb /s /q
rem del BitbusAssembly\*.user /s /q
del BitbusAssembly\*.bak /s /q
rd BitbusAssembly\Debug /s /q
rd BitbusAssembly\Release /s /q
rd BitbusAssembly\x64  /s /q

rem del Bin\Logs\  /s /q
