@echo off
REM Builds the plugin VST3 and runs the smoke test.
REM Needs: CMake, Ninja, and Visual Studio (or Build Tools) with the "Desktop development with C++" workload.
REM Usage: build.bat     (Release build into plugin\build)
REM No parenthesised blocks below on purpose: "Program Files (x86)" closes a block early in cmd.
setlocal
where cl >nul 2>nul && goto build
for /d %%Y in ("%ProgramFiles%\Microsoft Visual Studio\*") do for /d %%E in ("%%~Y\*") do if exist "%%~E\VC\Auxiliary\Build\vcvars64.bat" set "VCV=%%~E\VC\Auxiliary\Build\vcvars64.bat"
for /d %%Y in ("%ProgramFiles(x86)%\Microsoft Visual Studio\*") do for /d %%E in ("%%~Y\*") do if exist "%%~E\VC\Auxiliary\Build\vcvars64.bat" set "VCV=%%~E\VC\Auxiliary\Build\vcvars64.bat"
if not defined VCV echo Visual Studio with the C++ tools was not found & exit /b 1
call "%VCV%" >nul || exit /b 1
:build
cd /d "%~dp0"
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release || exit /b 1
cmake --build build || exit /b 1
ctest --test-dir build --output-on-failure || exit /b 1
echo.
echo Done. The VST3 is under %~dp0build\ (look for a .vst3 folder in the artefacts directory).
