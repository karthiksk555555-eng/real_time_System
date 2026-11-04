# NeuroSys Telemetry Agent - Windows Service Installer v2.0
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host " NeuroSys Agent - Auto-Boot Installer v2.0" -ForegroundColor Cyan
Write-Host " Triggers: AtStartup (SYSTEM) + AtLogon + Watchdog" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# [1/6] File Check
Write-Host "[1/6] Checking required files..." -NoNewline
$JarPath     = Join-Path $ScriptDir "neurosys-agent-1.0.0-SNAPSHOT-exec.jar"
$TargetJar   = Join-Path $ScriptDir "target\neurosys-agent-1.0.0-SNAPSHOT-exec.jar"
$BatLauncher = Join-Path $ScriptDir "Run-NeuroSys-Agent.bat"
$SilentVbs   = Join-Path $ScriptDir "Run-Silent.vbs"
$WScriptExe  = Join-Path $env:SystemRoot "System32\wscript.exe"
$PwshExe     = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$WatchdogPs1 = Join-Path $ScriptDir "NeuroSys-Watchdog.ps1"

if (-not (Test-Path $JarPath)) {
    if (Test-Path $TargetJar) {
        Copy-Item -Path $TargetJar -Destination $JarPath -Force
    } else {
        Write-Host " [FAILED]" -ForegroundColor Red
        Write-Host "[ERROR] Agent JAR missing: $JarPath" -ForegroundColor Red
        exit 1
    }
}
Write-Host " [OK]" -ForegroundColor Green

# [2/6] Remove stale stopped.flag
Write-Host "[2/6] Clearing stale state flags..." -NoNewline
$CacheDir = Join-Path $ScriptDir "cache"
if (-not (Test-Path $CacheDir)) { New-Item -ItemType Directory -Path $CacheDir -Force | Out-Null }
$StopFlag = Join-Path $CacheDir "stopped.flag"
if (Test-Path $StopFlag) { Remove-Item $StopFlag -Force -ErrorAction SilentlyContinue }
if (Test-Path (Join-Path $ScriptDir "stopped.flag")) { Remove-Item (Join-Path $ScriptDir "stopped.flag") -Force -ErrorAction SilentlyContinue }
Write-Host " [OK]" -ForegroundColor Green

# [3/6] Java Detection
Write-Host "[3/6] Detecting Java runtime..." -NoNewline
$JavaExe = $null

$BundledJava = Join-Path $ScriptDir "jre\bin\java.exe"
if (Test-Path $BundledJava) {
    $JavaExe = $BundledJava
} else {
    $SearchPaths = @(
        "C:\Program Files\Microsoft\jdk-17*\bin\java.exe",
        "C:\Program Files\Eclipse Adoptium\jdk-17*\bin\java.exe",
        "C:\Program Files\Eclipse Adoptium\jre-17*\bin\java.exe",
        "C:\Program Files\Java\jdk-17*\bin\java.exe",
        "C:\Program Files\Java\jre-17*\bin\java.exe",
        "C:\Program Files\Microsoft\jdk-21*\bin\java.exe",
        "C:\Program Files\Eclipse Adoptium\jdk-21*\bin\java.exe"
    )
    if ($env:JAVA_HOME) { $SearchPaths += (Join-Path $env:JAVA_HOME "bin\java.exe") }
    foreach ($pattern in $SearchPaths) {
        $found = Get-Item $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) { $JavaExe = $found.FullName; break }
    }
    if (-not $JavaExe) {
        $sj = Get-Command "java" -ErrorAction SilentlyContinue
        if ($sj) { $JavaExe = $sj.Source }
    }
}

if (-not $JavaExe) {
    Write-Host " [FAILED]" -ForegroundColor Red
    Write-Host "[ERROR] Java Runtime (JRE 17+) not found. Install from https://adoptium.net" -ForegroundColor Red
    exit 1
}
Write-Host " [OK] $JavaExe" -ForegroundColor Green

# Update Run-NeuroSys-Agent.bat with the absolute Java path
$BatContent = "@echo off`r`ntitle NeuroSys Cloud Monitoring Agent Daemon`r`ncd /d `"%~dp0`"`r`n"
$BatContent += "if exist `"%~dp0cache\stopped.flag`" del /f /q `"%~dp0cache\stopped.flag`" >nul 2>&1`r`n"
$BatContent += "set `"NEUROSYS_SERVER_URL=https://realtimesystem-production.up.railway.app/api/v1`"`r`n"
$BatContent += "set `"NEUROSYS_LAB_NAME=Computer Lab`"`r`n"
$BatContent += "set `"JAVA_EXE=$JavaExe`"`r`n"
$BatContent += "if not exist `"%JAVA_EXE%`" set `"JAVA_EXE=java.exe`"`r`n"
$BatContent += ":agent_loop`r`n"
$BatContent += "if exist `"%~dp0cache\stopped.flag`" exit /b 0`r`n"
$BatContent += "set `"ACTIVE_JAR=`"`r`n"
$BatContent += "if exist `"%~dp0neurosys-agent-1.0.0-SNAPSHOT-exec.jar`" set `"ACTIVE_JAR=%~dp0neurosys-agent-1.0.0-SNAPSHOT-exec.jar`"`r`n"
$BatContent += "if not defined ACTIVE_JAR if exist `"%~dp0target\neurosys-agent-1.0.0-SNAPSHOT-exec.jar`" set `"ACTIVE_JAR=%~dp0target\neurosys-agent-1.0.0-SNAPSHOT-exec.jar`"`r`n"
$BatContent += "if defined ACTIVE_JAR (`r`n"
$BatContent += "    echo [%DATE% %TIME%] Starting NeuroSys Agent: %ACTIVE_JAR% >> `"%~dp0neurosys-agent.log`" 2>&1`r`n"
$BatContent += "    `"%JAVA_EXE%`" -jar `"%ACTIVE_JAR%`"`r`n"
$BatContent += "    echo [%DATE% %TIME%] Agent exited. Restarting in 5s... >> `"%~dp0neurosys-agent.log`" 2>&1`r`n"
$BatContent += ") else (`r`n"
$BatContent += "    ping -n 10 127.0.0.1 >nul`r`n"
$BatContent += "    if exist `"%~dp0cache\stopped.flag`" exit /b 0`r`n"
$BatContent += "    goto agent_loop`r`n"
$BatContent += ")`r`n"
$BatContent += "if exist `"%~dp0cache\stopped.flag`" exit /b 0`r`n"
$BatContent += "ping -n 6 127.0.0.1 >nul`r`n"
$BatContent += "if exist `"%~dp0cache\stopped.flag`" exit /b 0`r`n"
$BatContent += "goto agent_loop`r`n"
[System.IO.File]::WriteAllText($BatLauncher, $BatContent, [System.Text.Encoding]::ASCII)
Write-Host "  [INFO] Run-NeuroSys-Agent.bat updated (Java: $JavaExe)" -ForegroundColor Yellow

# [4/6] Register Main Agent Scheduled Task
Write-Host "[4/6] Registering NeuroSysAgent scheduled task..." -NoNewline
$TaskName = "NeuroSysAgent"

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null

$Action          = New-ScheduledTaskAction -Execute $WScriptExe -Argument "`"$SilentVbs`" `"$BatLauncher`"" -WorkingDirectory $ScriptDir
$TriggerStartup  = New-ScheduledTaskTrigger -AtStartup
$TriggerStartup.Delay = "PT30S"
$TriggerLogon    = New-ScheduledTaskTrigger -AtLogon
$Settings        = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -RestartCount 99 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew

$TaskRegistered = $false
# Attempt 1: SYSTEM (most reliable - starts at boot without login)
try {
    $Principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger @($TriggerStartup, $TriggerLogon) -Settings $Settings -Principal $Principal -Force | Out-Null
    $TaskRegistered = $true
    Write-Host " [OK] SYSTEM (AtStartup + AtLogon)" -ForegroundColor Green
} catch {
    # Attempt 2: Current user with highest privileges
    try {
        Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger @($TriggerStartup, $TriggerLogon) -Settings $Settings -User $env:USERNAME -RunLevel Highest -Force | Out-Null
        $TaskRegistered = $true
        Write-Host " [OK] $env:USERNAME (AtStartup + AtLogon)" -ForegroundColor Green
    } catch {
        # Attempt 3: AtLogon only last resort
        try {
            Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $TriggerLogon -Settings $Settings -User $env:USERNAME -Force | Out-Null
            $TaskRegistered = $true
            Write-Host " [WARNING] $env:USERNAME AtLogon only (must log in after boot)" -ForegroundColor Yellow
        } catch {
            Write-Host " [FAILED]: $_" -ForegroundColor Red
            exit 1
        }
    }
}

# [5/6] Register Watchdog Scheduled Task
Write-Host "[5/6] Registering NeuroSysAgentWatchdog task..." -NoNewline
$WatchdogTask = "NeuroSysAgentWatchdog"
Unregister-ScheduledTask -TaskName $WatchdogTask -Confirm:$false -ErrorAction SilentlyContinue | Out-Null

if (Test-Path $WatchdogPs1) {
    try {
        $WdAction   = New-ScheduledTaskAction -Execute $PwshExe -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$WatchdogPs1`"" -WorkingDirectory $ScriptDir
        $WdTrigger  = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 2) -Once -At (Get-Date)
        $WdSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 1)

        try {
            $WdPrincipal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
            Register-ScheduledTask -TaskName $WatchdogTask -Action $WdAction -Trigger $WdTrigger -Settings $WdSettings -Principal $WdPrincipal -Force | Out-Null
            Write-Host " [OK] SYSTEM (every 2 minutes)" -ForegroundColor Green
        } catch {
            Register-ScheduledTask -TaskName $WatchdogTask -Action $WdAction -Trigger $WdTrigger -Settings $WdSettings -User $env:USERNAME -Force | Out-Null
            Write-Host " [OK] $env:USERNAME (every 2 minutes)" -ForegroundColor Green
        }
    } catch {
        Write-Host " [WARNING] $_" -ForegroundColor Yellow
    }
} else {
    Write-Host " [SKIP] NeuroSys-Watchdog.ps1 not found" -ForegroundColor Yellow
}

# Add startup shortcut as belt-and-suspenders
try {
    $StartupFolder = [Environment]::GetFolderPath("Startup")
    $ShortcutPath  = Join-Path $StartupFolder "NeuroSysAgent.lnk"
    $WScriptShell  = New-Object -ComObject WScript.Shell
    $Shortcut = $WScriptShell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath      = $WScriptExe
    $Shortcut.Arguments       = "`"$SilentVbs`" `"$BatLauncher`""
    $Shortcut.WorkingDirectory = $ScriptDir
    $Shortcut.WindowStyle     = 7
    $Shortcut.Description     = "NeuroSys Real-Time Monitoring Agent"
    $Shortcut.Save()
} catch { }

# [6/6] Launch Agent Now
Write-Host "[6/6] Launching agent now..." -NoNewline
try {
    Start-ScheduledTask -TaskName $TaskName | Out-Null
    Start-Sleep -Seconds 3
    Write-Host " [OK] Agent launched via scheduled task." -ForegroundColor Green
} catch {
    Start-Process -FilePath $WScriptExe -ArgumentList "`"$SilentVbs`" `"$BatLauncher`"" -WorkingDirectory $ScriptDir
    Write-Host " [OK] Agent launched directly." -ForegroundColor Green
}

Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host " Setup complete! Agent is running in the background." -ForegroundColor Green
Write-Host " Auto-starts on: Startup, Login, Power-On, Restart." -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""
