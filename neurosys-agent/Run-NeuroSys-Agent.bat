@echo off
title NeuroSys Cloud Monitoring Agent Daemon
cd /d "%~dp0"
if exist "%~dp0cache\stopped.flag" del /f /q "%~dp0cache\stopped.flag" >nul 2>&1
set "NEUROSYS_SERVER_URL=https://realtimesystem-production.up.railway.app/api/v1"
set "NEUROSYS_LAB_NAME=Computer Lab"
set "JAVA_EXE=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot\bin\java.exe"
if not exist "%JAVA_EXE%" set "JAVA_EXE=java.exe"
:agent_loop
if exist "%~dp0cache\stopped.flag" exit /b 0
set "ACTIVE_JAR="
if exist "%~dp0neurosys-agent-1.0.0-SNAPSHOT-exec.jar" set "ACTIVE_JAR=%~dp0neurosys-agent-1.0.0-SNAPSHOT-exec.jar"
if not defined ACTIVE_JAR if exist "%~dp0target\neurosys-agent-1.0.0-SNAPSHOT-exec.jar" set "ACTIVE_JAR=%~dp0target\neurosys-agent-1.0.0-SNAPSHOT-exec.jar"
if defined ACTIVE_JAR (
    echo [%DATE% %TIME%] Starting NeuroSys Agent: %ACTIVE_JAR% >> "%~dp0neurosys-agent.log" 2>&1
    "%JAVA_EXE%" -jar "%ACTIVE_JAR%"
    echo [%DATE% %TIME%] Agent exited. Restarting in 5s... >> "%~dp0neurosys-agent.log" 2>&1
) else (
    ping -n 10 127.0.0.1 >nul
    if exist "%~dp0cache\stopped.flag" exit /b 0
    goto agent_loop
)
if exist "%~dp0cache\stopped.flag" exit /b 0
ping -n 6 127.0.0.1 >nul
if exist "%~dp0cache\stopped.flag" exit /b 0
goto agent_loop
