@echo off
rem Full paths are used instead of "cd" because Windows strips the trailing space in this folder's name.
set "HERE=%~dp0"
if not exist "%HERE%.venv\Scripts\python.exe" (
    echo Creating virtual environment...
    python -m venv "%HERE%.venv"
)
"%HERE%.venv\Scripts\python.exe" -m pip install -q -r "%HERE%requirements.txt"
echo Starting Edit Doc Station at http://127.0.0.1:5000
"%HERE%.venv\Scripts\python.exe" "%HERE%app.py"
pause
