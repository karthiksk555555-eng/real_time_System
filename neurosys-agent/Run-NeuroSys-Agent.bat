@echo off
title NeuroSys Cloud Monitoring Agent Daemon
cd /d "%~dp0"

set "NEUROSYS_SERVER_URL=https://realtimesystem-production.up.railway.app/api/v1"
set "NEUROSYS_AGENT_ID=AGENT-9EA49A31"
set "NEUROSYS_LAB_NAME=Computer Lab 1"

set "JAVA_EXE=java.exe"
if exist "%~dp0jre\bin\java.exe" (
    set "JAVA_EXE=%~dp0jre\bin\java.exe"
)

:agent_loop
if exist "%~dp0cache\stopped.flag" exit /b 0

set "ACTIVE_JAR="
if exist "%~dp0neurosys-agent-1.0.0-SNAPSHOT-exec.jar" set "ACTIVE_JAR=%~dp0neurosys-agent-1.0.0-SNAPSHOT-exec.jar"
if not defined ACTIVE_JAR if exist "%~dp0neurosys-agent-1.0.0.jar" set "ACTIVE_JAR=%~dp0neurosys-agent-1.0.0.jar"
if not defined ACTIVE_JAR if exist "%~dp0neurosys-agent-1.0.0-SNAPSHOT.jar" set "ACTIVE_JAR=%~dp0neurosys-agent-1.0.0-SNAPSHOT.jar"
if not defined ACTIVE_JAR if exist "%~dp0target\neurosys-agent-1.0.0-SNAPSHOT-exec.jar" set "ACTIVE_JAR=%~dp0target\neurosys-agent-1.0.0-SNAPSHOT-exec.jar"

if defined ACTIVE_JAR (
    "%JAVA_EXE%" -jar "%ACTIVE_JAR%"
) else (
    ping -n 10 127.0.0.1 >nul
    if exist "%~dp0cache\stopped.flag" exit /b 0
    goto agent_loop
)

if exist "%~dp0cache\stopped.flag" exit /b 0

ping -n 6 127.0.0.1 >nul
if exist "%~dp0cache\stopped.flag" exit /b 0
goto agent_loop
