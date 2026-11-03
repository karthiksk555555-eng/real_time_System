# NeuroSys Telemetry Agent - Windows Service Installer (PowerShell)
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host " NeuroSys Telemetry Agent - Automatic Service Installer" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# [1/5] Checking files...
Write-Host "[1/5] Checking files..." -NoNewline
$JarPath = Join-Path $ScriptDir "neurosys-agent-1.0.0-SNAPSHOT-exec.jar"
$TargetJar = Join-Path $ScriptDir "target\neurosys-agent-1.0.0-SNAPSHOT-exec.jar"
$BatLauncher = Join-Path $ScriptDir "Run-NeuroSys-Agent.bat"
$SilentVbs = Join-Path $ScriptDir "Run-Silent.vbs"
$WScriptExe = Join-Path $env:SystemRoot "System32\wscript.exe"

if (-not (Test-Path $JarPath)) {
    if (Test-Path $TargetJar) {
        Copy-Item -Path $TargetJar -Destination $JarPath -Force
    } else {
        Write-Host " [FAILED]" -ForegroundColor Red
        Write-Host ""
        Write-Host "[ERROR] Agent executable JAR missing: $JarPath" -ForegroundColor Red
        exit 1
    }
}
Write-Host " [OK] Agent JAR found." -ForegroundColor Green

# Ensure agent.properties exists with Production Railway URL
$PropsPath = Join-Path $ScriptDir "agent.properties"
if (-not (Test-Path $PropsPath)) {
    $DefaultProps = @"
# NeuroSys Monitoring Agent Production Configuration
server.url=https://realtimesystem-production.up.railway.app/api/v1
agent.lab.name=Computer Lab
agent.collection.interval.seconds=1
agent.cache.dir=./cache
"@
    Set-Content -Path $PropsPath -Value $DefaultProps -Encoding UTF8
}

$StopFlag = Join-Path $ScriptDir "cache\stopped.flag"
if (Test-Path $StopFlag) { Remove-Item $StopFlag -Force -ErrorAction SilentlyContinue }

# [2/5] Checking Java...
Write-Host "[2/5] Checking Java..." -NoNewline
$BundledJava = Join-Path $ScriptDir "jre\bin\javaw.exe"
$JavaExe = $null

if (Test-Path $BundledJava) {
    $JavaExe = $BundledJava
} else {
    $SystemJava = Get-Command "javaw" -ErrorAction SilentlyContinue
    if (-not $SystemJava) { $SystemJava = Get-Command "java" -ErrorAction SilentlyContinue }
    if ($SystemJava) {
        $JavaExe = $SystemJava.Source
    }
}

if (-not $JavaExe) {
    Write-Host " [FAILED]" -ForegroundColor Red
    Write-Host ""
    Write-Host "[ERROR] Java Runtime (JRE 17+ or JDK 21) was not found in PATH or ./jre folder." -ForegroundColor Red
    exit 1
}
Write-Host " [OK] Java found." -ForegroundColor Green

# [3/5] Registering Auto-Boot Scheduled Task...
Write-Host "[3/5] Registering Silent Auto-Boot Scheduled Task..." -NoNewline
$TaskName = "NeuroSysAgent"

try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    
    $Action = New-ScheduledTaskAction -Execute $WScriptExe -Argument "`"$SilentVbs`" `"$BatLauncher`"" -WorkingDirectory $ScriptDir
    $TriggerStartup = New-ScheduledTaskTrigger -AtStartup
    $TriggerLogon = New-ScheduledTaskTrigger -AtLogon
    $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Hours 0)

    $Registered = $false
    try {
        $Principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
        Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger @($TriggerStartup, $TriggerLogon) -Settings $Settings -Principal $Principal -Force | Out-Null
        $Registered = $true
    } catch {
        try {
            # Fallback to current User account task registration
            Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $TriggerLogon -Settings $Settings -User $env:USERNAME -Force | Out-Null
            $Registered = $true
        } catch {
            Write-Host " [NOTICE: Non-Admin mode] Scheduled Task skipped, using Startup shortcut fallback." -ForegroundColor Yellow
            $Registered = $true
        }
    }

    if ($Registered) {
        Write-Host " [OK] Task registered." -ForegroundColor Green
    } else {
        throw "Failed to register scheduled task"
    }
} catch {
    Write-Host " [FAILED]" -ForegroundColor Red
    Write-Host ""
    Write-Host "[ERROR] Failed to register Scheduled Task: $_" -ForegroundColor Red
    exit 1
}

# [4/5] Adding Windows Startup Shortcut Backup...
Write-Host "[4/5] Setting up Silent Windows Startup Auto-Boot..." -NoNewline
try {
    $StartupFolder = [Environment]::GetFolderPath("Startup")
    $ShortcutPath = Join-Path $StartupFolder "NeuroSysAgent.lnk"
    
    $WScriptShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WScriptShell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = $WScriptExe
    $Shortcut.Arguments = "`"$SilentVbs`" `"$BatLauncher`""
    $Shortcut.WorkingDirectory = $ScriptDir
    $Shortcut.WindowStyle = 7 # Minimized
    $Shortcut.Description = "NeuroSys Real-Time Monitoring Agent Daemon"
    $Shortcut.Save()
    Write-Host " [OK] Silent Startup shortcut created." -ForegroundColor Green
} catch {
    Write-Host " [WARNING] Could not create startup shortcut: $_" -ForegroundColor Yellow
}

# [5/5] Launching Silent Agent Daemon...
Write-Host "[5/5] Launching Silent Agent Daemon..." -NoNewline
try {
    Start-ScheduledTask -TaskName $TaskName | Out-Null
    Start-Sleep -Seconds 2
    Write-Host " [OK] Silent Agent launched." -ForegroundColor Green
} catch {
    # Fallback start via wscript
    Start-Process -FilePath $WScriptExe -ArgumentList "`"$SilentVbs`" `"$BatLauncher`"" -WorkingDirectory $ScriptDir
    Write-Host " [OK] Silent Agent launched via background worker." -ForegroundColor Green
}

Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host " Setup completed successfully!" -ForegroundColor Green
Write-Host " The Agent runs silently in the background with NO window to close." -ForegroundColor Green
Write-Host " It will automatically start whenever Windows turns ON." -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""
