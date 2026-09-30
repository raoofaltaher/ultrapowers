: << 'CMDBLOCK'
@echo off
REM Cross-platform polyglot wrapper for hook scripts.
REM On Windows: cmd.exe runs the batch portion, which finds and calls bash.
REM On Unix: the shell interprets this as a script (: is a no-op in bash).
REM
REM Hook scripts use extensionless filenames (e.g. "session-start" not
REM "session-start.sh") so Claude Code's Windows auto-detection -- which
REM prepends "bash" to any command containing .sh -- doesn't interfere.
REM
REM Usage: run-hook.cmd <script-name> [args...]

if "%~1"=="" (
    echo run-hook.cmd: missing script name >&2
    exit /b 1
)

set "HOOK_DIR=%~dp0"

REM Find bash: Git for Windows in its standard locations, then bash on PATH (user-installed
REM Git Bash, MSYS2, Cygwin). Single-line IFs only: inside a parenthesised block cmd expands
REM %ERRORLEVEL% when it parses the block, before bash runs, which turned every hook exit
REM code (a guardrail's deny = 2) into 0.
set "HOOK_BASH="
if exist "C:\Program Files\Git\bin\bash.exe" set "HOOK_BASH=C:\Program Files\Git\bin\bash.exe"
if not defined HOOK_BASH if exist "C:\Program Files (x86)\Git\bin\bash.exe" set "HOOK_BASH=C:\Program Files (x86)\Git\bin\bash.exe"
if not defined HOOK_BASH where bash >nul 2>nul && set "HOOK_BASH=bash"

REM No bash found - exit silently rather than error
REM (plugin still works, just without SessionStart context injection)
if not defined HOOK_BASH exit /b 0

"%HOOK_BASH%" "%HOOK_DIR%%~1" %2 %3 %4 %5 %6 %7 %8 %9
exit /b %ERRORLEVEL%
CMDBLOCK

# Unix: run the named script directly
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_NAME="$1"
shift
exec bash "${SCRIPT_DIR}/${SCRIPT_NAME}" "$@"
