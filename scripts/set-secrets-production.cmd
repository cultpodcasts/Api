@echo off
setlocal

REM Delegates to PowerShell. Secrets/endpoints come from
REM scripts\local-secrets.production.env (gitignored) — see docs\worker-secrets.md

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0set-secrets-production.ps1"
exit /b %ERRORLEVEL%
