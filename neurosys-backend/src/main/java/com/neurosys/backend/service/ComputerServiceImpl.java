package com.neurosys.backend.service;

import com.neurosys.backend.dto.response.ComputerDto;
import com.neurosys.backend.entity.Computer;
import com.neurosys.backend.entity.HealthScore;
import com.neurosys.backend.entity.SystemMetric;
import com.neurosys.backend.enums.ComputerStatus;
import com.neurosys.backend.exception.ResourceNotFoundException;
import com.neurosys.backend.repository.ComputerRepository;
import com.neurosys.backend.repository.HealthScoreRepository;
import com.neurosys.backend.repository.SystemMetricRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

import com.neurosys.backend.dto.response.SystemMetricDto;
import com.neurosys.backend.dto.response.HealthScoreDto;

@Service
@RequiredArgsConstructor
public class ComputerServiceImpl implements ComputerService {

    private final ComputerRepository computerRepository;
    private final SystemMetricRepository systemMetricRepository;
    private final HealthScoreEngine healthScoreEngine;
    private final SystemMetricsService systemMetricsService;

    @Override
    @Transactional(readOnly = true)
    public List<ComputerDto> getAllComputers() {
        return computerRepository.findAllApprovedWithLab().stream()
                .map(this::mapToDto).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<ComputerDto> getPendingComputers() {
        return computerRepository.findByStatus(ComputerStatus.PENDING).stream().map(this::mapToDto).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public ComputerDto getComputerById(String id) {
        Computer computer = computerRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Computer", "id", id));
        return mapToDto(computer);
    }

    @Override
    @Transactional(readOnly = true)
    public ComputerDto getComputerByAgentId(String agentId) {
        Computer computer = computerRepository.findByAgentId(agentId)
                .orElseThrow(() -> new ResourceNotFoundException("Computer Agent", "agentId", agentId));
        return mapToDto(computer);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ComputerDto> getComputersByLab(String labName) {
        return computerRepository.findByLabName(labName).stream().map(this::mapToDto).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<ComputerDto> getComputersByLabId(String labId) {
        if (labId == null || labId.isEmpty() || "ALL".equalsIgnoreCase(labId)) {
            return getAllComputers();
        }
        return computerRepository.findByLabIdWithLab(labId).stream()
                .map(this::mapToDto).toList();
    }

    @Override
    @Transactional
    public ComputerDto approveComputer(String computerId) {
        Computer computer = computerRepository.findById(computerId)
                .orElseThrow(() -> new ResourceNotFoundException("Computer", "id", computerId));
        computer.setStatus(ComputerStatus.ONLINE);
        computer.setLastSeenAt(Instant.now());
        computer = computerRepository.save(computer);
        return mapToDto(computer);
    }

    @Override
    @Transactional
    public ComputerDto rejectComputer(String computerId) {
        Computer computer = computerRepository.findById(computerId)
                .orElseThrow(() -> new ResourceNotFoundException("Computer", "id", computerId));
        computer.setStatus(ComputerStatus.REJECTED);
        computer = computerRepository.save(computer);
        return mapToDto(computer);
    }

    @Override
    @Transactional(readOnly = true)
    public String getAgentStatus(String agentId) {
        return computerRepository.findByAgentId(agentId)
                .map(c -> c.getStatus().name())
                .orElse("NOT_REGISTERED");
    }

    private ComputerDto mapToDto(Computer computer) {
        SystemMetricDto metric = systemMetricsService.getLatestMetric(computer.getId());
        HealthScoreDto healthScore = healthScoreEngine.getLatestHealthScore(computer.getId());

        boolean isLive = computer.getStatus() == ComputerStatus.ONLINE 
                || computer.getStatus() == ComputerStatus.WARNING 
                || computer.getStatus() == ComputerStatus.CRITICAL;

        Double rx = metric != null && metric.getNetworkRxBytesSec() != null ? metric.getNetworkRxBytesSec() : 0.0;
        Double tx = metric != null && metric.getNetworkTxBytesSec() != null ? metric.getNetworkTxBytesSec() : 0.0;
        double totalBytesSec = rx + tx;
        double speedMbps = Math.round((totalBytesSec * 8.0 / 1_000_000.0) * 100.0) / 100.0;

        Double cpu = isLive 
                ? (metric != null && metric.getCpuUsagePercent() != null ? metric.getCpuUsagePercent() : (computer.getLastCpuUsage() != null ? computer.getLastCpuUsage() : 0.0))
                : null;
        Double ram = isLive 
                ? (metric != null && metric.getMemoryUsagePercent() != null ? metric.getMemoryUsagePercent() : (computer.getLastRamUsage() != null ? computer.getLastRamUsage() : 0.0))
                : null;
        Double disk = metric != null && metric.getDiskUsagePercent() != null ? metric.getDiskUsagePercent() : (computer.getLastDiskUsage() != null ? computer.getLastDiskUsage() : 0.0);

        return ComputerDto.builder()
                .id(computer.getId())
                .agentId(computer.getAgentId())
                .hostname(computer.getHostname())
                .computerName(computer.getComputerName())
                .ipAddress(computer.getIpAddress())
                .macAddress(computer.getMacAddress())
                .osName(computer.getOsName())
                .osVersion(computer.getOsVersion())
                .labId(computer.getLab() != null ? computer.getLab().getId() : null)
                .labCode(computer.getLab() != null ? computer.getLab().getCode() : null)
                .labName(computer.getLab() != null ? computer.getLab().getName() : (computer.getLabName() != null ? computer.getLabName() : "Computer Lab 1"))
                .displayName(computer.getDisplayName() != null ? computer.getDisplayName() : computer.getComputerName())
                .cpuModel(computer.getCpuModel())
                .totalRamMb(computer.getTotalRamMb())
                .agentVersion(computer.getAgentVersion())
                .status(computer.getStatus().name())
                .internetConnected(isLive && computer.getInternetConnected() != null ? computer.getInternetConnected() : false)
                .uptimeSeconds(isLive && computer.getUptimeSeconds() != null ? computer.getUptimeSeconds() : 0L)
                .lastSeenAt(computer.getLastSeenAt())
                .currentCpuUsage(cpu)
                .currentRamUsage(ram)
                .currentDiskUsage(disk)
                .currentHealthScore(isLive ? (healthScore != null ? healthScore.getOverallScore() : 100.0) : 0.0)
                .currentNetworkRxBytesSec(isLive ? rx : null)
                .currentNetworkTxBytesSec(isLive ? tx : null)
                .currentNetworkSpeedMbps(isLive ? speedMbps : null)
                .lastRecordedCpuUsage(metric != null ? metric.getCpuUsagePercent() : (computer.getLastCpuUsage() != null ? computer.getLastCpuUsage() : 0.0))
                .lastRecordedRamUsage(metric != null ? metric.getMemoryUsagePercent() : (computer.getLastRamUsage() != null ? computer.getLastRamUsage() : 0.0))
                .lastRecordedDiskUsage(metric != null ? metric.getDiskUsagePercent() : (computer.getLastDiskUsage() != null ? computer.getLastDiskUsage() : 0.0))
                .lastRecordedAt(metric != null ? metric.getRecordedAt() : computer.getLastSeenAt())
                .build();
    }
}
