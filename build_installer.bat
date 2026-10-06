@echo off
setlocal
set "APP_DIR=%~dp0"
for %%I in ("%APP_DIR%..") do set "PARENT=%%~fI"
set "PY=%PARENT%\DOCUMENT EDITING TOOL\.venv\Scripts\python.exe"
set "BUILD=%LOCALAPPDATA%\EditDocStationBuild"
set "SRC=%BUILD%\source"
set "DIST=%BUILD%\dist\Edit Doc Station"
set "ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
set "EDS_DIST=%DIST%"
set "EDS_MODELS=%USERPROFILE%\.rembg\models"
set "EDS_OUTPUT=%USERPROFILE%\Desktop"
set "EDS_ICON=%APP_DIR%static\logo.ico"

if not exist "%PY%" (
    echo The Python build environment was not found: "%PY%"
    pause
    exit /b 1
)
if not exist "%ISCC%" (
    echo Inno Setup was not found: "%ISCC%"
    echo Install Inno Setup 6, then run this script again.
    pause
    exit /b 1
)
if not exist "%EDS_MODELS%\u2net_human_seg\u2net_human_seg.onnx" (
    echo AI models are missing from "%EDS_MODELS%".
    echo Run Remove Background once for each model, then retry.
    pause
    exit /b 1
)

if exist "%BUILD%" rmdir /s /q "%BUILD%"
mkdir "%SRC%"
copy /y "%APP_DIR%desktop.py" "%SRC%\desktop.py" >nul
copy /y "%APP_DIR%app.py" "%SRC%\app.py" >nul
copy /y "%APP_DIR%converters.py" "%SRC%\converters.py" >nul
xcopy "%APP_DIR%templates" "%SRC%\templates" /e /i /q /y >nul
xcopy "%APP_DIR%static" "%SRC%\static" /e /i /q /y >nul
echo Building Edit Doc Station. This can take several minutes...
"%PY%" -m PyInstaller --noconfirm --clean --onedir --windowed --name "Edit Doc Station" --icon "%EDS_ICON%" --distpath "%BUILD%\dist" --workpath "%BUILD%\work" --specpath "%BUILD%" --paths "%SRC%" --add-data "%SRC%\templates;templates" --add-data "%SRC%\static;static" --collect-all rembg --collect-all onnxruntime --collect-all pymatting --hidden-import app --hidden-import converters --hidden-import rembg.sessions.u2net --hidden-import rembg.sessions.u2netp --hidden-import rembg.sessions.u2net_human_seg --hidden-import scipy.ndimage --hidden-import pythoncom --hidden-import pywintypes --hidden-import win32com.client --hidden-import win32timezone "%SRC%\desktop.py"
if errorlevel 1 (
    echo Python packaging failed.
    pause
    exit /b 1
)

echo Building the Windows installer...
"%ISCC%" "%APP_DIR%installer.iss"
if errorlevel 1 (
    echo Installer compilation failed.
    pause
    exit /b 1
)

echo.
echo Installer created: "%EDS_OUTPUT%\Edit Doc Station Setup.exe"
pause