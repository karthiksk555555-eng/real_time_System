package com.neurosys.backend.service;

import com.neurosys.backend.dto.request.CreateDeploymentRequest;
import com.neurosys.backend.dto.request.DeploymentStatusUpdateRequest;
import com.neurosys.backend.dto.response.AgentDeploymentTaskDto;
import com.neurosys.backend.dto.response.DeploymentResponseDto;
import com.neurosys.backend.dto.response.DeploymentTargetDto;
import com.neurosys.backend.dto.response.SoftwarePackageDto;
import com.neurosys.backend.entity.Computer;
import com.neurosys.backend.entity.Lab;
import com.neurosys.backend.entity.SoftwareDeployment;
import com.neurosys.backend.entity.SoftwareDeploymentTarget;
import com.neurosys.backend.entity.SoftwarePackage;
import com.neurosys.backend.enums.ComputerStatus;
import com.neurosys.backend.enums.DeploymentTargetStatus;
import com.neurosys.backend.enums.DeploymentTaskStatus;
import com.neurosys.backend.exception.ResourceNotFoundException;
import com.neurosys.backend.repository.ComputerRepository;
import com.neurosys.backend.repository.LabRepository;
import com.neurosys.backend.repository.SoftwareDeploymentRepository;
import com.neurosys.backend.repository.SoftwareDeploymentTargetRepository;
import com.neurosys.backend.repository.SoftwarePackageRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class SoftwareDeploymentServiceImpl implements SoftwareDeploymentService {

    private final SoftwarePackageRepository packageRepository;
    private final SoftwareDeploymentRepository deploymentRepository;
    private final SoftwareDeploymentTargetRepository targetRepository;
    private final LabRepository labRepository;
    private final ComputerRepository computerRepository;

    @Override
    @Transactional(readOnly = true)
    public List<SoftwarePackageDto> getAvailablePackages() {
        return packageRepository.findByActiveTrue().stream()
                .map(this::mapPackageToDto)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public SoftwarePackageDto getPackageById(String id) {
        SoftwarePackage pkg = packageRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("SoftwarePackage", "id", id));
        return mapPackageToDto(pkg);
    }

    @Override
    @Transactional
    public SoftwarePackageDto createPackage(SoftwarePackageDto dto) {
        SoftwarePackage pkg = SoftwarePackage.builder()
                .name(dto.getName())
                .version(dto.getVersion())
                .installerUrl(dto.getInstallerUrl())
                .installerType(dto.getInstallerType())
                .silentArguments(dto.getSilentArguments())
                .checksum(dto.getChecksum())
                .supportedOs(dto.getSupportedOs() != null ? dto.getSupportedOs() : "Windows")
                .active(true)
                .build();
        SoftwarePackage saved = packageRepository.save(pkg);
        return mapPackageToDto(saved);
    }

    @Override
    @Transactional
    public DeploymentResponseDto createDeployment(CreateDeploymentRequest request, String username) {
        SoftwarePackage pkg;
        if (request.getCustomInstallerUrl() != null && !request.getCustomInstallerUrl().isBlank()) {
            String url = request.getCustomInstallerUrl().trim();
            String name = (request.getCustomAppName() != null && !request.getCustomAppName().isBlank())
                    ? request.getCustomAppName().trim()
                    : "Direct Application (" + (url.contains("/") ? url.substring(url.lastIndexOf("/") + 1) : "App") + ")";
            boolean isMsi = url.toLowerCase().contains(".msi");
            String args = (request.getCustomSilentArgs() != null && !request.getCustomSilentArgs().isBlank())
                    ? request.getCustomSilentArgs().trim()
                    : (isMsi ? "/qn /norestart" : "/S");

            pkg = packageRepository.save(SoftwarePackage.builder()
                    .name(name)
                    .version("Latest")
                    .installerUrl(url)
                    .installerType(isMsi ? com.neurosys.backend.enums.InstallerType.MSI : com.neurosys.backend.enums.InstallerType.EXE)
                    .silentArguments(args)
                    .checksum("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
                    .supportedOs("Windows")
                    .active(true)
                    .build());
        } else if (request.getSoftwarePackageId() != null && !request.getSoftwarePackageId().isBlank() && !"CUSTOM_LINK".equals(request.getSoftwarePackageId())) {
            pkg = packageRepository.findById(request.getSoftwarePackageId())
                    .orElseThrow(() -> new ResourceNotFoundException("SoftwarePackage", "id", request.getSoftwarePackageId()));
        } else {
            throw new IllegalArgumentException("Either select a software package or provide a direct installer download link.");
        }

        Lab lab;
        if (request.getLabId() == null || "ALL".equalsIgnoreCase(request.getLabId())) {
            lab = labRepository.findAll().stream().findFirst()
                    .orElseThrow(() -> new ResourceNotFoundException("Lab", "id", request.getLabId() != null ? request.getLabId() : "ALL"));
        } else {
            lab = labRepository.findById(request.getLabId())
                    .orElseThrow(() -> new ResourceNotFoundException("Lab", "id", request.getLabId()));
        }

        List<Computer> targetComputers;
        if (request.getComputerIds() != null && !request.getComputerIds().isEmpty()) {
            targetComputers = computerRepository.findAllById(request.getComputerIds()).stream()
                    .filter(c -> c.getStatus() != ComputerStatus.REJECTED)
                    .collect(Collectors.toList());
        } else {
            targetComputers = computerRepository.findByLabId(lab.getId()).stream()
                    .filter(c -> c.getStatus() != ComputerStatus.REJECTED)
                    .collect(Collectors.toList());
            if (targetComputers.isEmpty() && "ALL".equalsIgnoreCase(request.getLabId())) {
                targetComputers = computerRepository.findAllApprovedWithLab();
            }
        }

        if (targetComputers.isEmpty()) {
            throw new IllegalArgumentException("No eligible target computers found in lab " + lab.getName());
        }

        String depNum = "DEP-" + System.currentTimeMillis();
        int hours = (request.getExpirationHours() != null && request.getExpirationHours() > 0) ? request.getExpirationHours() : 24;

        SoftwareDeployment deployment = SoftwareDeployment.builder()
                .deploymentNumber(depNum)
                .softwarePackage(pkg)
                .lab(lab)
                .createdByUser(username != null ? username : "ADMIN")
                .status(DeploymentTaskStatus.PENDING)
                .expiresAt(Instant.now().plus(hours, ChronoUnit.HOURS))
                .targets(new ArrayList<>())
                .build();

        SoftwareDeployment savedDeployment = deploymentRepository.save(deployment);

        List<SoftwareDeploymentTarget> targets = targetComputers.stream()
                .map(comp -> SoftwareDeploymentTarget.builder()
                        .deployment(savedDeployment)
                        .computer(comp)
                        .status(DeploymentTargetStatus.PENDING)
                        .statusDetail("Pending distribution to agent")
                        .build())
                .collect(Collectors.toList());

        List<SoftwareDeploymentTarget> savedTargets = targetRepository.saveAll(targets);
        savedDeployment.setTargets(savedTargets);

        log.info("Created Software Deployment [{}] for package '{}' to {} computers in lab '{}'",
                depNum, pkg.getName(), savedTargets.size(), lab.getName());

        return mapDeploymentToDto(savedDeployment);
    }

    @Override
    @Transactional(readOnly = true)
    public List<DeploymentResponseDto> getAllDeployments() {
        return deploymentRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(this::mapDeploymentToDto)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public DeploymentResponseDto getDeploymentById(String id) {
        SoftwareDeployment dep = deploymentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("SoftwareDeployment", "id", id));
        return mapDeploymentToDto(dep);
    }

    @Override
    @Transactional(readOnly = true)
    public List<DeploymentResponseDto> getDeploymentsByLab(String labId) {
        return deploymentRepository.findByLabIdOrderByCreatedAtDesc(labId).stream()
                .map(this::mapDeploymentToDto)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public DeploymentResponseDto cancelDeployment(String id, String username) {
        SoftwareDeployment dep = deploymentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("SoftwareDeployment", "id", id));

        if (dep.getStatus() == DeploymentTaskStatus.COMPLETED || dep.getStatus() == DeploymentTaskStatus.CANCELLED) {
            return mapDeploymentToDto(dep);
        }

        dep.setStatus(DeploymentTaskStatus.CANCELLED);

        for (SoftwareDeploymentTarget target : dep.getTargets()) {
            if (target.getStatus() == DeploymentTargetStatus.PENDING || target.getStatus() == DeploymentTargetStatus.DOWNLOADING) {
                target.setStatus(DeploymentTargetStatus.CANCELLED);
                target.setStatusDetail("Deployment cancelled by admin " + username);
                target.setCompletedAt(Instant.now());
            }
        }

        deploymentRepository.save(dep);
        log.info("Software Deployment [{}] cancelled by {}", dep.getDeploymentNumber(), username);
        return mapDeploymentToDto(dep);
    }

    @Override
    @Transactional(readOnly = true)
    public List<AgentDeploymentTaskDto> getPendingTasksForAgent(String agentId) {
        Set<DeploymentTargetStatus> activeStatuses = Set.of(
                DeploymentTargetStatus.PENDING,
                DeploymentTargetStatus.DOWNLOADING,
                DeploymentTargetStatus.INSTALLING
        );

        List<SoftwareDeploymentTarget> targets = targetRepository.findPendingTasksForAgent(agentId, activeStatuses);

        return targets.stream()
                .map(target -> {
                    SoftwareDeployment dep = target.getDeployment();
                    SoftwarePackage pkg = dep.getSoftwarePackage();
                    return AgentDeploymentTaskDto.builder()
                            .targetId(target.getId())
                            .deploymentId(dep.getId())
                            .deploymentNumber(dep.getDeploymentNumber())
                            .packageName(pkg.getName())
                            .packageVersion(pkg.getVersion())
                            .installerUrl(pkg.getInstallerUrl())
                            .installerType(pkg.getInstallerType())
                            .silentArguments(pkg.getSilentArguments())
                            .checksum(pkg.getChecksum())
                            .build();
                })
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public DeploymentTargetDto updateTargetStatus(String deploymentId, String agentId, DeploymentStatusUpdateRequest request) {
        List<SoftwareDeploymentTarget> targets = targetRepository.findByDeploymentIdAndAgentOrHostnameOrId(deploymentId, agentId);
        if (targets.isEmpty()) {
            throw new ResourceNotFoundException("SoftwareDeploymentTarget", "deploymentId/agentId", deploymentId + "/" + agentId);
        }
        SoftwareDeploymentTarget target = targets.get(0);

        DeploymentTargetStatus newStatus = request.getStatus();
        target.setStatus(newStatus);
        target.setStatusDetail(request.getStatusDetail());

        if ((newStatus == DeploymentTargetStatus.DOWNLOADING || newStatus == DeploymentTargetStatus.INSTALLING) && target.getStartedAt() == null) {
            target.setStartedAt(Instant.now());
        }

        if (newStatus == DeploymentTargetStatus.INSTALLED ||
            newStatus == DeploymentTargetStatus.ALREADY_INSTALLED ||
            newStatus == DeploymentTargetStatus.FAILED ||
            newStatus == DeploymentTargetStatus.CANCELLED ||
            newStatus == DeploymentTargetStatus.OFFLINE) {
            target.setCompletedAt(Instant.now());
        }

        targetRepository.save(target);

        // Recalculate parent deployment overall status
        recalculateDeploymentStatus(target.getDeployment());

        return mapTargetToDto(target);
    }

    private void recalculateDeploymentStatus(SoftwareDeployment dep) {
        List<SoftwareDeploymentTarget> targets = targetRepository.findByDeploymentId(dep.getId());
        if (targets.isEmpty()) return;

        boolean anyInProgress = false;
        boolean anyPending = false;
        int completedCount = 0;
        int failedOrCancelledCount = 0;

        for (SoftwareDeploymentTarget t : targets) {
            DeploymentTargetStatus s = t.getStatus();
            if (s == DeploymentTargetStatus.DOWNLOADING || s == DeploymentTargetStatus.INSTALLING) {
                anyInProgress = true;
            } else if (s == DeploymentTargetStatus.PENDING) {
                anyPending = true;
            } else if (s == DeploymentTargetStatus.INSTALLED || s == DeploymentTargetStatus.ALREADY_INSTALLED) {
                completedCount++;
            } else if (s == DeploymentTargetStatus.FAILED || s == DeploymentTargetStatus.CANCELLED || s == DeploymentTargetStatus.OFFLINE) {
                failedOrCancelledCount++;
            }
        }

        int total = targets.size();
        if (completedCount == total) {
            dep.setStatus(DeploymentTaskStatus.COMPLETED);
        } else if (failedOrCancelledCount == total) {
            dep.setStatus(DeploymentTaskStatus.FAILED);
        } else if (anyInProgress) {
            dep.setStatus(DeploymentTaskStatus.IN_PROGRESS);
        } else if (!anyPending && (completedCount > 0 || failedOrCancelledCount > 0)) {
            dep.setStatus(DeploymentTaskStatus.PARTIALLY_COMPLETED);
        } else if (anyPending) {
            dep.setStatus(DeploymentTaskStatus.PENDING); // Stays PENDING until agent actually starts working
        }

        deploymentRepository.save(dep);
    }

    @Scheduled(cron = "0 */10 * * * *") // Run every 10 minutes
    @Override
    @Transactional
    public void checkAndExpireDeployments() {
        Instant now = Instant.now();
        List<SoftwareDeploymentTarget> expiredTargets = targetRepository.findExpiredTargets(
                Set.of(DeploymentTargetStatus.PENDING, DeploymentTargetStatus.DOWNLOADING, DeploymentTargetStatus.INSTALLING),
                now
        );

        for (SoftwareDeploymentTarget target : expiredTargets) {
            target.setStatus(DeploymentTargetStatus.OFFLINE);
            target.setStatusDetail("Expired - Target computer was offline or unreachable before task expired");
            target.setCompletedAt(now);
            targetRepository.save(target);
            recalculateDeploymentStatus(target.getDeployment());
        }

        if (!expiredTargets.isEmpty()) {
            log.info("Expired {} pending deployment targets", expiredTargets.size());
        }

        // Recover stale jobs stuck in DOWNLOADING or INSTALLING for > 30 minutes
        Instant staleThreshold = now.minus(30, ChronoUnit.MINUTES);
        List<SoftwareDeploymentTarget> staleTargets = targetRepository.findStaleActiveTargets(
                Set.of(DeploymentTargetStatus.DOWNLOADING, DeploymentTargetStatus.INSTALLING),
                staleThreshold
        );
        for (SoftwareDeploymentTarget target : staleTargets) {
            target.setStatus(DeploymentTargetStatus.FAILED);
            target.setStatusDetail("Timed out after 30 minutes with no progress update from agent");
            target.setCompletedAt(now);
            targetRepository.save(target);
            recalculateDeploymentStatus(target.getDeployment());
        }
        if (!staleTargets.isEmpty()) {
            log.warn("Recovered {} stale deployment targets stuck in DOWNLOADING/INSTALLING > 30 min", staleTargets.size());
        }
    }

    private SoftwarePackageDto mapPackageToDto(SoftwarePackage pkg) {
        return SoftwarePackageDto.builder()
                .id(pkg.getId())
                .name(pkg.getName())
                .version(pkg.getVersion())
                .installerUrl(pkg.getInstallerUrl())
                .installerType(pkg.getInstallerType())
                .silentArguments(pkg.getSilentArguments())
                .checksum(pkg.getChecksum())
                .supportedOs(pkg.getSupportedOs())
                .active(pkg.isActive())
                .build();
    }

    private DeploymentTargetDto mapTargetToDto(SoftwareDeploymentTarget target) {
        Computer c = target.getComputer();
        return DeploymentTargetDto.builder()
                .id(target.getId())
                .computerId(c != null ? c.getId() : null)
                .computerName(c != null ? (c.getDisplayName() != null ? c.getDisplayName() : c.getHostname()) : null)
                .hostname(c != null ? c.getHostname() : null)
                .ipAddress(c != null ? c.getIpAddress() : null)
                .agentId(c != null ? c.getAgentId() : null)
                .status(target.getStatus())
                .statusDetail(target.getStatusDetail())
                .startedAt(target.getStartedAt())
                .completedAt(target.getCompletedAt())
                .build();
    }

    private DeploymentResponseDto mapDeploymentToDto(SoftwareDeployment dep) {
        List<DeploymentTargetDto> targetDtos = dep.getTargets() != null ?
                dep.getTargets().stream().map(this::mapTargetToDto).collect(Collectors.toList()) :
                new ArrayList<>();

        int total = targetDtos.size();
        int completed = (int) targetDtos.stream().filter(t -> t.getStatus() == DeploymentTargetStatus.INSTALLED || t.getStatus() == DeploymentTargetStatus.ALREADY_INSTALLED).count();
        int failed = (int) targetDtos.stream().filter(t -> t.getStatus() == DeploymentTargetStatus.FAILED || t.getStatus() == DeploymentTargetStatus.CANCELLED || t.getStatus() == DeploymentTargetStatus.OFFLINE).count();
        int pending = total - completed - failed;

        return DeploymentResponseDto.builder()
                .id(dep.getId())
                .deploymentNumber(dep.getDeploymentNumber())
                .softwarePackage(dep.getSoftwarePackage() != null ? mapPackageToDto(dep.getSoftwarePackage()) : null)
                .labId(dep.getLab() != null ? dep.getLab().getId() : null)
                .labName(dep.getLab() != null ? dep.getLab().getName() : null)
                .createdByUser(dep.getCreatedByUser())
                .status(dep.getStatus())
                .expiresAt(dep.getExpiresAt())
                .createdAt(dep.getCreatedAt())
                .targets(targetDtos)
                .totalTargets(total)
                .completedTargets(completed)
                .failedTargets(failed)
                .pendingTargets(pending)
                .build();
    }
}
