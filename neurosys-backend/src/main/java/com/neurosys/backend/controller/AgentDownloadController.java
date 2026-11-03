package com.neurosys.backend.controller;

import com.neurosys.backend.entity.Lab;
import com.neurosys.backend.entity.LabEnrollmentCode;
import com.neurosys.backend.exception.ResourceNotFoundException;
import com.neurosys.backend.repository.LabEnrollmentCodeRepository;
import com.neurosys.backend.repository.LabRepository;
import com.neurosys.backend.service.LabService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.Optional;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Slf4j
@RestController
@RequestMapping("/api/v1/agent")
@RequiredArgsConstructor
@Tag(name = "Agent Download & Package Generator", description = "REST APIs for generating and downloading pre-configured agent setup packages for specific computer labs")
public class AgentDownloadController {

    private final LabRepository labRepository;
    private final LabEnrollmentCodeRepository enrollmentCodeRepository;
    private final LabService labService;

    @GetMapping("/download")
    @Operation(summary = "Download Lab-Preconfigured NeuroSys Agent Package", description = "Generates a .zip package containing agent binary, pre-configured agent.properties, and enrollment code for the target lab")
    public ResponseEntity<byte[]> downloadAgentPackage(
            @RequestParam(required = false) String labId,
            @RequestParam(required = false) String enrollmentCode) {
        
        Lab lab;
        if (labId != null && !labId.isEmpty() && !"ALL".equalsIgnoreCase(labId)) {
            lab = labRepository.findById(labId)
                    .orElseGet(() -> labRepository.findByCodeIgnoreCase(labId)
                    .orElseGet(() -> labRepository.findAll().stream().findFirst().orElseThrow(() -> new ResourceNotFoundException("Lab", "id", labId))));
        } else {
            lab = labRepository.findAll().stream().findFirst()
                    .orElseThrow(() -> new ResourceNotFoundException("Lab", "default", "none"));
        }

        String activeCode = enrollmentCode;
        if (activeCode == null || activeCode.isEmpty()) {
            Optional<LabEnrollmentCode> existing = enrollmentCodeRepository.findByLabIdOrderByCreatedAtDesc(lab.getId())
                    .stream().filter(c -> !c.getRevoked() && c.getExpiresAt().isAfter(Instant.now())).findFirst();
            if (existing.isPresent()) {
                activeCode = existing.get().getCode();
            } else {
                var newCode = labService.generateEnrollmentCode(lab.getId(), null, "system");
                activeCode = newCode.getCode();
            }
        }

        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ZipOutputStream zos = new ZipOutputStream(baos);

            // 1. Write agent.properties
            String propsContent = String.format(
                    "# NeuroSys Agent Configuration Package\n" +
                    "# Generated for: %s (%s)\n" +
                    "server.url=https://realtimesystemmonitoring-production-7322.up.railway.app/api/v1\n" +
                    "agent.enrollment.code=%s\n" +
                    "agent.lab.name=%s\n" +
                    "agent.collection.interval.seconds=1\n",
                    lab.getName(), lab.getCode(), activeCode, lab.getName()
            );
            writeZipEntry(zos, "agent.properties", propsContent.getBytes());

            // 2. Write Run-Silent.vbs
            String vbsContent =
                    "Set WshShell = CreateObject(\"WScript.Shell\")\r\n" +
                    "If WScript.Arguments.Count > 0 Then\r\n" +
                    "    WshShell.Run \"cmd.exe /c \"\"\" & WScript.Arguments(0) & \"\"\"\", 0, False\r\n" +
                    "End If\r\n";
            writeZipEntry(zos, "Run-Silent.vbs", vbsContent.getBytes());

            // 3. Write start-agent.bat
            String startBatContent =
                    "@echo off\r\n" +
                    "setlocal EnableDelayedExpansion\r\n" +
                    "title NeuroSys Agent - Start\r\n" +
                    "net session >nul 2>&1\r\n" +
                    "if %errorlevel% neq 0 (\r\n" +
                    "    powershell -NoProfile -ExecutionPolicy Bypass -Command \"Start-Process '%~f0' -Verb RunAs\" >nul 2>&1\r\n" +
                    "    if %errorlevel% equ 0 exit /b\r\n" +
                    ")\r\n" +
                    "cd /d \"%~dp0\"\r\n" +
                    "if exist \"%~dp0cache\\stopped.flag\" del /f /q \"%~dp0cache\\stopped.flag\" >nul 2>&1\r\n" +
                    "echo ===================================================\r\n" +
                    "echo  NeuroSys Agent Control - Start\r\n" +
                    "echo ===================================================\r\n" +
                    "echo.\r\n" +
                    "set \"ACTIVE_JAR=\"\r\n" +
                    "if exist \"%~dp0neurosys-agent-1.0.0-SNAPSHOT-exec.jar\" set \"ACTIVE_JAR=%~dp0neurosys-agent-1.0.0-SNAPSHOT-exec.jar\"\r\n" +
                    "if not defined ACTIVE_JAR if exist \"%~dp0neurosys-agent-1.0.0.jar\" set \"ACTIVE_JAR=%~dp0neurosys-agent-1.0.0.jar\"\r\n" +
                    "if not defined ACTIVE_JAR if exist \"%~dp0neurosys-agent-1.0.0-SNAPSHOT.jar\" set \"ACTIVE_JAR=%~dp0neurosys-agent-1.0.0-SNAPSHOT.jar\"\r\n" +
                    "if not defined ACTIVE_JAR if exist \"%~dp0target\\neurosys-agent-1.0.0-SNAPSHOT-exec.jar\" set \"ACTIVE_JAR=%~dp0target\\neurosys-agent-1.0.0-SNAPSHOT-exec.jar\"\r\n" +
                    "if not defined ACTIVE_JAR (\r\n" +
                    "    echo [ERROR] NeuroSys Agent installation files are missing!\r\n" +
                    "    echo Please run setup-agent.bat first to install the Agent.\r\n" +
                    "    echo.\r\n" +
                    "    ping -n 4 127.0.0.1 >nul\r\n" +
                    "    exit /b 1\r\n" +
                    ")\r\n" +
                    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$TaskName = 'NeuroSysAgent'; $ScriptDir = '%~dp0'; $WScriptExe = Join-Path $env:SystemRoot 'System32\\wscript.exe'; $SilentVbs = Join-Path $ScriptDir 'Run-Silent.vbs'; $BatLauncher = Join-Path $ScriptDir 'Run-NeuroSys-Agent.bat'; try { if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) { $Action = New-ScheduledTaskAction -Execute $WScriptExe -ArgumentList \\\"`\"$SilentVbs`\" `\"$BatLauncher`\"\\\" -WorkingDirectory $ScriptDir; $TriggerLogon = New-ScheduledTaskTrigger -AtLogon; $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable; Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $TriggerLogon -Settings $Settings -User $env:USERNAME -Force | Out-Null } } catch {}; try { $StartupFolder = [Environment]::GetFolderPath('Startup'); $ShortcutPath = Join-Path $StartupFolder 'NeuroSysAgent.lnk'; if (-not (Test-Path $ShortcutPath)) { $WScriptShell = New-Object -ComObject WScript.Shell; $Shortcut = $WScriptShell.CreateShortcut($ShortcutPath); $Shortcut.TargetPath = $WScriptExe; $Shortcut.Arguments = \\\"`\"$SilentVbs`\" `\"$BatLauncher`\"\\\"; $Shortcut.WorkingDirectory = $ScriptDir; $Shortcut.WindowStyle = 7; $Shortcut.Save() } } catch {}\" >nul 2>&1\r\n" +
                    "set \"ALREADY_RUNNING=0\"\r\n" +
                    "for /f \"tokens=*\" %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -Command \"Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'java.exe' -or $_.Name -eq 'javaw.exe') -and $_.CommandLine -like '*neurosys-agent*' } | Select-Object -ExpandProperty ProcessId\"') do (\r\n" +
                    "    if not \"%%P\"==\"\" set \"ALREADY_RUNNING=1\"\r\n" +
                    ")\r\n" +
                    "if \"%ALREADY_RUNNING%\"==\"1\" (\r\n" +
                    "    echo NeuroSys Agent is running silently in the background.\r\n" +
                    "    echo Status: RUNNING\r\n" +
                    "    echo.\r\n" +
                    "    ping -n 3 127.0.0.1 >nul\r\n" +
                    "    exit /b 0\r\n" +
                    ")\r\n" +
                    "echo Starting NeuroSys Agent silently in the background...\r\n" +
                    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"if (Get-ScheduledTask -TaskName 'NeuroSysAgent' -ErrorAction SilentlyContinue) { Start-ScheduledTask -TaskName 'NeuroSysAgent' } else { wscript.exe '%~dp0Run-Silent.vbs' '%~dp0Run-NeuroSys-Agent.bat' }\" >nul 2>&1\r\n" +
                    "ping -n 5 127.0.0.1 >nul\r\n" +
                    "set \"IS_RUNNING=0\"\r\n" +
                    "for /f \"tokens=*\" %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -Command \"Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'java.exe' -or $_.Name -eq 'javaw.exe') -and $_.CommandLine -like '*neurosys-agent*' } | Select-Object -ExpandProperty ProcessId\"') do (\r\n" +
                    "    if not \"%%P\"==\"\" set \"IS_RUNNING=1\"\r\n" +
                    ")\r\n" +
                    "if \"%IS_RUNNING%\"==\"1\" (\r\n" +
                    "    echo.\r\n" +
                    "    echo NeuroSys Agent is running silently in the background.\r\n" +
                    "    echo Status: RUNNING\r\n" +
                    "    echo.\r\n" +
                    "    echo (This control window will close automatically. The Agent will continue running silently.)\r\n" +
                    "    echo.\r\n" +
                    "    ping -n 3 127.0.0.1 >nul\r\n" +
                    "    exit /b 0\r\n" +
                    ") else (\r\n" +
                    "    echo.\r\n" +
                    "    echo [FAILED] Could not verify Agent process startup.\r\n" +
                    "    echo Please run setup-agent.bat first.\r\n" +
                    "    echo.\r\n" +
                    "    ping -n 4 127.0.0.1 >nul\r\n" +
                    "    exit /b 1\r\n" +
                    ")\r\n";
            writeZipEntry(zos, "start-agent.bat", startBatContent.getBytes());

            // 4. Write stop-agent.bat
            String stopBatContent =
                    "@echo off\r\n" +
                    "setlocal EnableDelayedExpansion\r\n" +
                    "title NeuroSys Agent - Stop\r\n" +
                    "net session >nul 2>&1\r\n" +
                    "if %errorlevel% neq 0 (\r\n" +
                    "    powershell -NoProfile -ExecutionPolicy Bypass -Command \"Start-Process '%~f0' -Verb RunAs\" >nul 2>&1\r\n" +
                    "    if %errorlevel% equ 0 exit /b\r\n" +
                    ")\r\n" +
                    "cd /d \"%~dp0\"\r\n" +
                    "if not exist \"%~dp0cache\" mkdir \"%~dp0cache\" >nul 2>&1\r\n" +
                    "echo stopped > \"%~dp0cache\\stopped.flag\"\r\n" +
                    "if exist \"%~dp0cache\\agent-status.json\" del /f /q \"%~dp0cache\\agent-status.json\" >nul 2>&1\r\n" +
                    "echo ===================================================\r\n" +
                    "echo  NeuroSys Agent Control - Stop\r\n" +
                    "echo ===================================================\r\n" +
                    "echo.\r\n" +
                    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"if (Get-ScheduledTask -TaskName 'NeuroSysAgent' -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName 'NeuroSysAgent' -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName 'NeuroSysAgent' -Confirm:\\$false -ErrorAction SilentlyContinue }\" >nul 2>&1\r\n" +
                    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$u = [Environment]::GetFolderPath('Startup'); $uL = Join-Path $u 'NeuroSysAgent.lnk'; if (Test-Path $uL) { Remove-Item $uL -Force -ErrorAction SilentlyContinue }; $c = [Environment]::GetFolderPath('CommonStartup'); $cL = Join-Path $c 'NeuroSysAgent.lnk'; if (Test-Path $cL) { Remove-Item $cL -Force -ErrorAction SilentlyContinue }\" >nul 2>&1\r\n" +
                    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*Run-NeuroSys-Agent*' -or $_.CommandLine -like '*Run-Silent*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }\" >nul 2>&1\r\n" +
                    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$procs = Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'java.exe' -or $_.Name -eq 'javaw.exe') -and $_.CommandLine -like '*neurosys-agent*' }; foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }\" >nul 2>&1\r\n" +
                    "ping -n 3 127.0.0.1 >nul\r\n" +
                    "set \"STILL_RUNNING=0\"\r\n" +
                    "for /f \"tokens=*\" %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -Command \"Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'java.exe' -or $_.Name -eq 'javaw.exe') -and $_.CommandLine -like '*neurosys-agent*' } | Select-Object -ExpandProperty ProcessId\"') do (\r\n" +
                    "    if not \"%%P\"==\"\" set \"STILL_RUNNING=1\"\r\n" +
                    ")\r\n" +
                    "if \"%STILL_RUNNING%\"==\"0\" (\r\n" +
                    "    echo.\r\n" +
                    "    echo NeuroSys Agent\r\n" +
                    "    echo Status: STOPPED\r\n" +
                    "    echo.\r\n" +
                    ") else (\r\n" +
                    "    echo.\r\n" +
                    "    echo [FAILED] Agent process could not be terminated.\r\n" +
                    "    echo Status: RUNNING\r\n" +
                    "    echo.\r\n" +
                    "    ping -n 4 127.0.0.1 >nul\r\n" +
                    "    exit /b 1\r\n" +
                    ")\r\n" +
                    "ping -n 3 127.0.0.1 >nul\r\n";
            writeZipEntry(zos, "stop-agent.bat", stopBatContent.getBytes());

            // 5. Write uninstall-agent.bat
            String uninstallBatContent =
                    "@echo off\r\n" +
                    "setlocal EnableDelayedExpansion\r\n" +
                    "title NeuroSys Agent Uninstaller\r\n" +
                    "net session >nul 2>&1\r\n" +
                    "if %errorlevel% neq 0 (\r\n" +
                    "    powershell -NoProfile -ExecutionPolicy Bypass -Command \"Start-Process '%~f0' -Verb RunAs\" >nul 2>&1\r\n" +
                    "    if %errorlevel% equ 0 exit /b\r\n" +
                    ")\r\n" +
                    "set \"AGENT_DIR=%~dp0\"\r\n" +
                    "if \"%AGENT_DIR:~-1%\"==\"\\\" set \"AGENT_DIR=%AGENT_DIR:~0,-1%\"\r\n" +
                    "echo.\r\n" +
                    "echo ===================================================\r\n" +
                    "echo  NeuroSys Agent Uninstaller\r\n" +
                    "echo ===================================================\r\n" +
                    "echo.\r\n" +
                    "set \"AGENT_STOPPED=FAILED\"\r\n" +
                    "set \"TASK_REMOVED=FAILED\"\r\n" +
                    "set \"PROCESS_TERMINATED=FAILED\"\r\n" +
                    "set \"RUNTIME_REMOVED=FAILED\"\r\n" +
                    "set \"INSTALLATION_REMOVED=FAILED\"\r\n" +
                    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"if (Get-ScheduledTask -TaskName 'NeuroSysAgent' -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName 'NeuroSysAgent' -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName 'NeuroSysAgent' -Confirm:\\$false -ErrorAction SilentlyContinue }\" >nul 2>&1\r\n" +
                    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"if (-not (Get-ScheduledTask -TaskName 'NeuroSysAgent' -ErrorAction SilentlyContinue)) { exit 0 } else { exit 1 }\" >nul 2>&1\r\n" +
                    "if %errorlevel% equ 0 (\r\n" +
                    "    set \"TASK_REMOVED=OK\"\r\n" +
                    "    set \"AGENT_STOPPED=OK\"\r\n" +
                    ") else (\r\n" +
                    "    set \"TASK_REMOVED=FAILED\"\r\n" +
                    ")\r\n" +
                    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$u = [Environment]::GetFolderPath('Startup'); $uL = Join-Path $u 'NeuroSysAgent.lnk'; if (Test-Path $uL) { Remove-Item $uL -Force -ErrorAction SilentlyContinue }; $c = [Environment]::GetFolderPath('CommonStartup'); $cL = Join-Path $c 'NeuroSysAgent.lnk'; if (Test-Path $cL) { Remove-Item $cL -Force -ErrorAction SilentlyContinue }\" >nul 2>&1\r\n" +
                    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$procs = Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'java.exe' -or $_.Name -eq 'javaw.exe') -and $_.CommandLine -like '*neurosys-agent*' }; foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }\" >nul 2>&1\r\n" +
                    "ping -n 3 127.0.0.1 >nul\r\n" +
                    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$p = Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'java.exe' -or $_.Name -eq 'javaw.exe') -and $_.CommandLine -like '*neurosys-agent*' }; if (-not $p) { exit 0 } else { exit 1 }\" >nul 2>&1\r\n" +
                    "if %errorlevel% equ 0 (\r\n" +
                    "    set \"PROCESS_TERMINATED=OK\"\r\n" +
                    ") else (\r\n" +
                    "    set \"PROCESS_TERMINATED=FAILED\"\r\n" +
                    ")\r\n" +
                    "if exist \"%AGENT_DIR%\\cache\" rmdir /s /q \"%AGENT_DIR%\\cache\" >nul 2>&1\r\n" +
                    "if exist \"%AGENT_DIR%\\logs\" rmdir /s /q \"%AGENT_DIR%\\logs\" >nul 2>&1\r\n" +
                    "set \"RUNTIME_REMOVED=OK\"\r\n" +
                    "set \"INSTALLATION_REMOVED=OK\"\r\n" +
                    "echo [%AGENT_STOPPED%] Agent stopped\r\n" +
                    "echo [%TASK_REMOVED%] Scheduled task removed\r\n" +
                    "echo [%PROCESS_TERMINATED%] Agent process terminated\r\n" +
                    "echo [%RUNTIME_REMOVED%] Runtime files removed\r\n" +
                    "echo [%INSTALLATION_REMOVED%] Installation removed\r\n" +
                    "echo.\r\n" +
                    "if \"%PROCESS_TERMINATED%\"==\"OK\" if \"%TASK_REMOVED%\"==\"OK\" (\r\n" +
                    "    echo NeuroSys Agent has been successfully uninstalled.\r\n" +
                    "    echo.\r\n" +
                    "    echo You can now delete the ZIP package.\r\n" +
                    "    echo.\r\n" +
                    "    powershell -NoProfile -ExecutionPolicy Bypass -Command \"Start-Process powershell -ArgumentList '-NoProfile', '-Command', 'Start-Sleep -Seconds 4; Remove-Item `\"%AGENT_DIR%`\" -Recurse -Force' -WindowStyle Hidden\" >nul 2>&1\r\n" +
                    "    ping -n 3 127.0.0.1 >nul\r\n" +
                    "    exit /b 0\r\n" +
                    ") else (\r\n" +
                    "    echo [FAILED] NeuroSys Agent was NOT completely removed.\r\n" +
                    "    echo Please try again as Administrator.\r\n" +
                    "    echo.\r\n" +
                    "    ping -n 4 127.0.0.1 >nul\r\n" +
                    "    exit /b 1\r\n" +
                    ")\r\n";
            writeZipEntry(zos, "uninstall-agent.bat", uninstallBatContent.getBytes());

            // 6. Write status-agent.bat
            String statusBatContent =
                    "@echo off\r\n" +
                    "setlocal EnableDelayedExpansion\r\n" +
                    "title NeuroSys Agent - Status Check\r\n" +
                    "cd /d \"%~dp0\"\r\n" +
                    "echo ===================================================\r\n" +
                    "echo  NeuroSys Agent Status\r\n" +
                    "echo ===================================================\r\n" +
                    "echo.\r\n" +
                    "set \"AGENT_PID=\"\r\n" +
                    "for /f \"tokens=*\" %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -Command \"Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'java.exe' -or $_.Name -eq 'javaw.exe') -and $_.CommandLine -like '*neurosys-agent*' } | Select-Object -ExpandProperty ProcessId\"') do (\r\n" +
                    "    if not \"%%P\"==\"\" set \"AGENT_PID=%%P\"\r\n" +
                    ")\r\n" +
                    "if defined AGENT_PID (\r\n" +
                    "    echo Process Status : RUNNING ^(PID %AGENT_PID%^)\r\n" +
                    "    if exist \"%~dp0cache\\agent-status.json\" (\r\n" +
                    "        powershell -NoProfile -ExecutionPolicy Bypass -Command \"$json = Get-Content '%~dp0cache\\agent-status.json' -Raw | ConvertFrom-Json; Write-Host ('Server Status  : ' + (if ($json.connected) { 'CONNECTED' } else { 'RECONNECTING' })); Write-Host ('Server URL     : ' + $json.serverUrl); Write-Host ('Lab Name       : ' + $json.labName); Write-Host ('Last Heartbeat : ' + (if ($json.lastHeartbeat) { $json.lastHeartbeat } else { 'Not connected' }))\"\r\n" +
                    "    ) else (\r\n" +
                    "        echo Server Status  : UNKNOWN ^(initializing...^)\r\n" +
                    "    )\r\n" +
                    "    echo.\r\n" +
                    "    echo Status: RUNNING\r\n" +
                    ") else (\r\n" +
                    "    echo Process Status : NOT RUNNING\r\n" +
                    "    echo.\r\n" +
                    "    echo Status: STOPPED\r\n" +
                    ")\r\n" +
                    "echo.\r\n" +
                    "ping -n 4 127.0.0.1 >nul\r\n";
            writeZipEntry(zos, "status-agent.bat", statusBatContent.getBytes());

            // 7. Write setup-agent.bat
            String setupBatContent =
                    "@echo off\r\n" +
                    "setlocal\r\n" +
                    "cd /d \"%~dp0\"\r\n" +
                    "net session >nul 2>&1\r\n" +
                    "if %errorlevel% neq 0 (\r\n" +
                    "    echo Requesting Administrative privileges to install NeuroSys Agent...\r\n" +
                    "    powershell -NoProfile -ExecutionPolicy Bypass -Command \"Start-Process '%~f0' -Verb RunAs\" >nul 2>&1\r\n" +
                    "    if %errorlevel% equ 0 exit /b\r\n" +
                    ")\r\n" +
                    "powershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0install-service.ps1\"\r\n" +
                    "if %errorlevel% neq 0 (\r\n" +
                    "    echo.\r\n" +
                    "    echo [FATAL ERROR] Agent setup failed with error code %errorlevel%.\r\n" +
                    "    echo.\r\n" +
                    "    ping -n 5 127.0.0.1 >nul\r\n" +
                    "    exit /b %errorlevel%\r\n" +
                    ")\r\n" +
                    "ping -n 3 127.0.0.1 >nul\r\n";
            writeZipEntry(zos, "setup-agent.bat", setupBatContent.getBytes());

            // 8. Write Run-NeuroSys-Agent.bat
            // IMPORTANT: Do NOT hardcode NEUROSYS_AGENT_ID - each computer generates its own unique ID
            // from hardware (hostname + MAC address hash) persisted in agent_id.txt on first run.
            String runBatContent =
                    "@echo off\r\n" +
                    "title NeuroSys Cloud Monitoring Agent Daemon\r\n" +
                    "cd /d \"%~dp0\"\r\n" +
                    "set \"NEUROSYS_SERVER_URL=https://realtimesystem-production.up.railway.app/api/v1\"\r\n" +
                    "set \"NEUROSYS_LAB_NAME=" + lab.getName() + "\"\r\n" +
                    "set \"NEUROSYS_ENROLLMENT_CODE=" + activeCode + "\"\r\n" +
                    "set \"JAVA_EXE=javaw.exe\"\r\n" +
                    "if exist \"%~dp0jre\\bin\\javaw.exe\" (\r\n" +
                    "    set \"JAVA_EXE=%~dp0jre\\bin\\javaw.exe\"\r\n" +
                    ") else if exist \"%~dp0jre\\bin\\java.exe\" (\r\n" +
                    "    set \"JAVA_EXE=%~dp0jre\\bin\\java.exe\"\r\n" +
                    ")\r\n" +
                    ":agent_loop\r\n" +
                    "if exist \"%~dp0cache\\stopped.flag\" exit /b 0\r\n" +
                    "set \"ACTIVE_JAR=\"\r\n" +
                    "if exist \"%~dp0neurosys-agent-1.0.0-SNAPSHOT-exec.jar\" set \"ACTIVE_JAR=%~dp0neurosys-agent-1.0.0-SNAPSHOT-exec.jar\"\r\n" +
                    "if not defined ACTIVE_JAR if exist \"%~dp0neurosys-agent-1.0.0.jar\" set \"ACTIVE_JAR=%~dp0neurosys-agent-1.0.0.jar\"\r\n" +
                    "if not defined ACTIVE_JAR if exist \"%~dp0neurosys-agent-1.0.0-SNAPSHOT.jar\" set \"ACTIVE_JAR=%~dp0neurosys-agent-1.0.0-SNAPSHOT.jar\"\r\n" +
                    "if not defined ACTIVE_JAR if exist \"%~dp0target\\neurosys-agent-1.0.0-SNAPSHOT-exec.jar\" set \"ACTIVE_JAR=%~dp0target\\neurosys-agent-1.0.0-SNAPSHOT-exec.jar\"\r\n" +
                    "if defined ACTIVE_JAR (\r\n" +
                    "    \"%JAVA_EXE%\" -jar \"%ACTIVE_JAR%\"\r\n" +
                    ") else (\r\n" +
                    "    ping -n 10 127.0.0.1 >nul\r\n" +
                    "    if exist \"%~dp0cache\\stopped.flag\" exit /b 0\r\n" +
                    "    goto agent_loop\r\n" +
                    ")\r\n" +
                    "if exist \"%~dp0cache\\stopped.flag\" exit /b 0\r\n" +
                    "ping -n 6 127.0.0.1 >nul\r\n" +
                    "if exist \"%~dp0cache\\stopped.flag\" exit /b 0\r\n" +
                    "goto agent_loop\r\n";
            writeZipEntry(zos, "Run-NeuroSys-Agent.bat", runBatContent.getBytes());

            // 9. Write install-service.ps1 - registers BOTH AtStartup + AtLogon triggers so agent starts
            // even when Windows boots without an interactive user session (e.g. after power failure)
            String ps1Content =
                    "$ErrorActionPreference = 'Stop'\r\n" +
                    "$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path\r\n" +
                    "Set-Location $ScriptDir\r\n" +
                    "Write-Host '===================================================' -ForegroundColor Cyan\r\n" +
                    "Write-Host ' NeuroSys Telemetry Agent - Automatic Service Installer' -ForegroundColor Cyan\r\n" +
                    "Write-Host '===================================================' -ForegroundColor Cyan\r\n" +
                    "$TaskName = 'NeuroSysAgent'\r\n" +
                    "$BatLauncher = Join-Path $ScriptDir 'Run-NeuroSys-Agent.bat'\r\n" +
                    "$SilentVbs = Join-Path $ScriptDir 'Run-Silent.vbs'\r\n" +
                    "$WScriptExe = Join-Path $env:SystemRoot 'System32\\wscript.exe'\r\n" +
                    "try {\r\n" +
                    "    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null\r\n" +
                    "    $Action = New-ScheduledTaskAction -Execute $WScriptExe -ArgumentList \"`\"$SilentVbs`\" `\"$BatLauncher`\"\" -WorkingDirectory $ScriptDir\r\n" +
                    "    $TriggerStartup = New-ScheduledTaskTrigger -AtStartup\r\n" +
                    "    $TriggerLogon = New-ScheduledTaskTrigger -AtLogon\r\n" +
                    "    $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Hours 0)\r\n" +
                    "    $Registered = $false\r\n" +
                    "    try {\r\n" +
                    "        $Principal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\\SYSTEM' -LogonType ServiceAccount -RunLevel Highest\r\n" +
                    "        Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger @($TriggerStartup, $TriggerLogon) -Settings $Settings -Principal $Principal -Force | Out-Null\r\n" +
                    "        $Registered = $true\r\n" +
                    "    } catch {\r\n" +
                    "        Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger @($TriggerStartup, $TriggerLogon) -Settings $Settings -User $env:USERNAME -Force | Out-Null\r\n" +
                    "        $Registered = $true\r\n" +
                    "    }\r\n" +
                    "    if ($Registered) {\r\n" +
                    "        Write-Host ' [OK] Silent Task registered (AtStartup + AtLogon).' -ForegroundColor Green\r\n" +
                    "        Start-ScheduledTask -TaskName $TaskName | Out-Null\r\n" +
                    "    }\r\n" +
                    "} catch {\r\n" +
                    "    Write-Host ' [NOTICE] Running silent background agent fallback.' -ForegroundColor Yellow\r\n" +
                    "    Start-Process $WScriptExe -ArgumentList \"`\"$SilentVbs`\" `\"$BatLauncher`\"\" -WorkingDirectory $ScriptDir\r\n" +
                    "}\r\n";
            writeZipEntry(zos, "install-service.ps1", ps1Content.getBytes());

            // 10. Write README-INSTALLATION.txt
            String readmeContent = String.format(
                    "=========================================================\n" +
                    "NEUROSYS AGENT ONBOARDING PACKAGE\n" +
                    "Target Laboratory: %s (%s)\n" +
                    "Enrollment Code:   %s\n" +
                    "Generated At:      %s\n" +
                    "=========================================================\n\n" +
                    "INSTRUCTIONS FOR SYSTEM ADMINISTRATORS:\n\n" +
                    "1. Extract all files in this ZIP archive to a folder on the target Windows workstation.\n" +
                    "2. Run 'start-agent.bat' or 'setup-agent.bat' once.\n" +
                    "3. The Agent will launch SILENTLY in the background with NO open command window.\n" +
                    "4. Look for the small Windows system-tray status icon near the clock:\n" +
                    "   - 🟢 Green  = Connected\n" +
                    "   - 🟠 Orange = Reconnecting\n" +
                    "5. Right-click the tray icon to Open Dashboard, Restart Agent, or check status.\n" +
                    "6. To check CLI status, run 'status-agent.bat'.\n" +
                    "7. To stop the agent, run 'stop-agent.bat'.\n" +
                    "8. To completely remove the agent, run 'uninstall-agent.bat'.\n\n" +
                    "Need assistance? Contact your NeuroSys Lab Supervisor.\n",
                    lab.getName(), lab.getCode(), activeCode, Instant.now().toString()
            );
            writeZipEntry(zos, "README-INSTALLATION.txt", readmeContent.getBytes());

            // 11. Attach compiled neurosys-agent JAR from classpath or filesystem
            byte[] jarBytes = null;
            try (InputStream is = getClass().getResourceAsStream("/static/agent-bin/neurosys-agent-1.0.0-SNAPSHOT-exec.jar")) {
                if (is != null) {
                    jarBytes = is.readAllBytes();
                }
            } catch (Exception e) {
                log.warn("Could not read agent jar from classpath resource: {}", e.getMessage());
            }

            if (jarBytes == null || jarBytes.length == 0) {
                Path agentJarPath = Paths.get("..", "neurosys-agent", "target", "neurosys-agent-1.0.0-SNAPSHOT-exec.jar");
                if (!Files.exists(agentJarPath)) {
                    agentJarPath = Paths.get("neurosys-agent", "target", "neurosys-agent-1.0.0-SNAPSHOT-exec.jar");
                }
                if (!Files.exists(agentJarPath)) {
                    agentJarPath = Paths.get("neurosys-agent-1.0.0-SNAPSHOT-exec.jar");
                }
                if (Files.exists(agentJarPath)) {
                    jarBytes = Files.readAllBytes(agentJarPath);
                }
            }

            if (jarBytes != null && jarBytes.length > 0) {
                writeZipEntry(zos, "neurosys-agent-1.0.0-SNAPSHOT-exec.jar", jarBytes);
                writeZipEntry(zos, "neurosys-agent-1.0.0.jar", jarBytes);
            }

            zos.finish();
            zos.close();

            byte[] zipData = baos.toByteArray();
            String filename = String.format("neurosys-agent-%s.zip", lab.getCode().replaceAll("[^A-Za-z0-9]", ""));

            log.info("[INFO] Generated Agent Package ZIP for Lab {} ({}), Size: {} bytes", lab.getName(), lab.getCode(), zipData.length);

            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .body(zipData);

        } catch (Exception e) {
            log.error("Failed to generate agent download package ZIP", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    private void writeZipEntry(ZipOutputStream zos, String entryName, byte[] data) throws Exception {
        ZipEntry entry = new ZipEntry(entryName);
        zos.putNextEntry(entry);
        zos.write(data);
        zos.closeEntry();
    }
}
