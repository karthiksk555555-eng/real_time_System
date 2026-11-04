@echo off
setlocal EnableDelayedExpansion
title NeuroSys Agent - Start

:: 1. Check Administrator Privileges & Elevate if Needed
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process '%~f0' -Verb RunAs" >nul 2>&1
    if %errorlevel% equ 0 exit /b
)

cd /d "%~dp0"

:: 2. Clear stopped.flag so agent can run
if exist "%~dp0cache\stopped.flag" del /f /q "%~dp0cache\stopped.flag" >nul 2>&1
if exist "%~dp0stopped.flag" del /f /q "%~dp0stopped.flag" >nul 2>&1

echo ===================================================
echo  NeuroSys Agent Control - Start
echo ===================================================
echo.

:: 3. Resolve Agent JAR File
set "ACTIVE_JAR="
if exist "%~dp0neurosys-agent-1.0.0-SNAPSHOT-exec.jar" set "ACTIVE_JAR=%~dp0neurosys-agent-1.0.0-SNAPSHOT-exec.jar"
if not defined ACTIVE_JAR if exist "%~dp0target\neurosys-agent-1.0.0-SNAPSHOT-exec.jar" set "ACTIVE_JAR=%~dp0target\neurosys-agent-1.0.0-SNAPSHOT-exec.jar"

if not defined ACTIVE_JAR (
    echo [ERROR] NeuroSys Agent JAR not found!
    echo Please run setup-agent.bat first.
    echo.
    pause
    exit /b 1
)

:: 4. Register/Update Windows Scheduled Task (AtStartup + AtLogon, SYSTEM principal)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ScriptDir = '%~dp0'.TrimEnd('\'); ^
     $TaskName = 'NeuroSysAgent'; ^
     $WScriptExe = Join-Path $env:SystemRoot 'System32\wscript.exe'; ^
     $SilentVbs = Join-Path $ScriptDir 'Run-Silent.vbs'; ^
     $BatLauncher = Join-Path $ScriptDir 'Run-NeuroSys-Agent.bat'; ^
     try { ^
         Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null; ^
         $Action = New-ScheduledTaskAction -Execute $WScriptExe -ArgumentList (chr(34)+$SilentVbs+chr(34)+' '+chr(34)+$BatLauncher+chr(34)) -WorkingDirectory $ScriptDir; ^
         $TriggerStart = New-ScheduledTaskTrigger -AtStartup; ^
         $TriggerStart.Delay = 'PT30S'; ^
         $TriggerLogon = New-ScheduledTaskTrigger -AtLogon; ^
         $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Hours 0) -MultipleInstances IgnoreNew; ^
         try { ^
             $P = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' -LogonType ServiceAccount -RunLevel Highest; ^
             Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger @($TriggerStart,$TriggerLogon) -Settings $Settings -Principal $P -Force | Out-Null; ^
             Write-Host '[OK] Task registered (SYSTEM, AtStartup+AtLogon)' ^
         } catch { ^
             Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger @($TriggerStart,$TriggerLogon) -Settings $Settings -User $env:USERNAME -RunLevel Highest -Force | Out-Null; ^
             Write-Host '[OK] Task registered (User, AtStartup+AtLogon)' ^
         } ^
     } catch { Write-Host '[WARN] Task registration failed: ' $_ }" >nul 2>&1

:: 5. Check if already running
set "ALREADY_RUNNING=0"
for /f "tokens=*" %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'java.exe' -or $_.Name -eq 'javaw.exe') -and $_.CommandLine -like '*neurosys-agent*' } | Select-Object -ExpandProperty ProcessId"') do (
    if not "%%P"=="" set "ALREADY_RUNNING=1"
)

if "%ALREADY_RUNNING%"=="1" (
    echo NeuroSys Agent is already running in the background.
    echo Status: RUNNING
    echo.
    ping -n 3 127.0.0.1 >nul
    exit /b 0
)

:: 6. Start Agent via Scheduled Task (preferred) or wscript fallback
echo Starting NeuroSys Agent silently...
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-ScheduledTask -TaskName 'NeuroSysAgent' -ErrorAction SilentlyContinue) { Start-ScheduledTask -TaskName 'NeuroSysAgent' } else { Start-Process '%SystemRoot%\System32\wscript.exe' -ArgumentList ('/c \"' + '%~dp0Run-Silent.vbs' + '\" \"' + '%~dp0Run-NeuroSys-Agent.bat' + '\"') -WorkingDirectory '%~dp0' }" >nul 2>&1

:: Wait for JVM startup
ping -n 5 127.0.0.1 >nul

:: 7. Verify
set "IS_RUNNING=0"
for /f "tokens=*" %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'java.exe' -or $_.Name -eq 'javaw.exe') -and $_.CommandLine -like '*neurosys-agent*' } | Select-Object -ExpandProperty ProcessId"') do (
    if not "%%P"=="" set "IS_RUNNING=1"
)

if "%IS_RUNNING%"=="1" (
    echo.
    echo NeuroSys Agent is now running silently in the background.
    echo Status: RUNNING
    echo Auto-starts on: Boot (AtStartup) + Login (AtLogon)
    echo.
    ping -n 3 127.0.0.1 >nul
    exit /b 0
) else (
    echo.
    echo [FAILED] Could not confirm agent startup.
    echo Try running setup-agent.bat as Administrator.
    echo.
    pause
    exit /b 1
)
