# NeuroSys Agent Watchdog
# Runs every 2 minutes via Scheduled Task "NeuroSysAgentWatchdog"
# Checks if the agent Java process is alive; restarts ONLY the NeuroSys agent if not.
# Never kills other Java processes.

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogFile     = Join-Path $ScriptDir "neurosys-agent.log"
$StopFlag    = Join-Path $ScriptDir "cache\stopped.flag"
$BatLauncher = Join-Path $ScriptDir "Run-NeuroSys-Agent.bat"
$SilentVbs   = Join-Path $ScriptDir "Run-Silent.vbs"
$WScriptExe  = Join-Path $env:SystemRoot "System32\wscript.exe"
$TaskName    = "NeuroSysAgent"

function Write-Log {
    param([string]$Message)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [WATCHDOG] $Message"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
}

# 1. If administrator intentionally stopped the agent, do nothing.
if (Test-Path $StopFlag) {
    Write-Log "stopped.flag found - agent intentionally stopped. Watchdog idle."
    exit 0
}

# 2. Check if the NeuroSys agent Java process is running.
$agentProcs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { ($_.Name -eq 'java.exe' -or $_.Name -eq 'javaw.exe') -and $_.CommandLine -like '*neurosys-agent*' }

if ($agentProcs -and $agentProcs.Count -gt 0) {
    # Agent is alive — nothing to do.
    exit 0
}

# 3. Agent not running — restart it.
Write-Log "Agent process NOT found. Attempting restart..."

# Prefer restarting via the scheduled task (preserves correct working dir and env)
try {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task) {
        Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop | Out-Null
        Write-Log "Agent restarted via Scheduled Task '$TaskName'."
        exit 0
    }
} catch {
    Write-Log "Could not start scheduled task: $_"
}

# Fallback: launch directly via wscript (silent, no window)
try {
    Start-Process -FilePath $WScriptExe `
        -ArgumentList "`"$SilentVbs`" `"$BatLauncher`"" `
        -WorkingDirectory $ScriptDir `
        -ErrorAction Stop
    Write-Log "Agent restarted directly via wscript."
} catch {
    Write-Log "FAILED to restart agent: $_"
}
