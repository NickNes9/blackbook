@echo off
set "PIDFILE=%~dp0Black Book.pid"
if not exist "%PIDFILE%" (
  echo Black Book is not running.
  timeout /t 2 >nul
  exit /b 0
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$file=$env:PIDFILE; try { $record=Get-Content -Raw -LiteralPath $file | ConvertFrom-Json; $process=Get-Process -Id ([int]$record.pid) -ErrorAction Stop; $started=[DateTimeOffset]::FromUnixTimeMilliseconds([int64]$record.startedAt); $actual=[DateTimeOffset]$process.StartTime.ToUniversalTime(); if ($process.ProcessName -ne 'node' -or [Math]::Abs(($actual-$started).TotalSeconds) -gt 5) { throw 'Stale PID file' }; Stop-Process -Id $process.Id -Force; Remove-Item -LiteralPath $file -Force; Write-Output 'Black Book stopped.' } catch { Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue; Write-Output 'Black Book is not running.' }"
timeout /t 2 >nul
