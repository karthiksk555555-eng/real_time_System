package com.neurosys.backend.service;

import com.neurosys.backend.dto.response.HealthScoreDto;
import com.neurosys.backend.entity.Computer;
import com.neurosys.backend.entity.HealthScore;
import com.neurosys.backend.entity.SystemMetric;
import com.neurosys.backend.enums.HealthCategory;
import com.neurosys.backend.repository.HealthScoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.Duration;

@Slf4j
@Service
@RequiredArgsConstructor
public class HealthScoreEngineImpl implements HealthScoreEngine {

    private final HealthScoreRepository healthScoreRepository;
    private final java.util.Map<String, HealthScoreDto> latestHealthScoreCache = new java.util.concurrent.ConcurrentHashMap<>();

    @Override
    @Transactional
    public HealthScoreDto calculateAndSaveHealthScore(Computer computer, SystemMetric metric, Double crashProbability) {
        double score = 100.0;

        // 1. CPU Penalty (Max 25 pts)
        double cpuUsage = metric.getCpuUsagePercent() != null ? metric.getCpuUsagePercent() : 0.0;
        double cpuPenalty = 0.0;
        if (cpuUsage > 70.0) {
            cpuPenalty = Math.min(25.0, (cpuUsage - 70.0) * 0.833);
        }
        score -= cpuPenalty;

        // 2. RAM Penalty (Max 20 pts)
        double ramUsage = metric.getMemoryUsagePercent() != null ? metric.getMemoryUsagePercent() : 0.0;
        double ramPenalty = 0.0;
        if (ramUsage > 80.0) {
            ramPenalty = Math.min(20.0, (ramUsage - 80.0) * 1.0);
        }
        score -= ramPenalty;

        // 3. Disk Penalty (Max 15 pts)
        double diskUsage = metric.getDiskUsagePercent() != null ? metric.getDiskUsagePercent() : 0.0;
        double diskPenalty = 0.0;
        if (diskUsage > 85.0) {
            diskPenalty = Math.min(15.0, (diskUsage - 85.0) * 1.0);
        }
        score -= diskPenalty;

        // 4. Temperature Penalty (Max 15 pts)
        double tempPenalty = 0.0;
        if (metric.getCpuTemperature() != null && metric.getCpuTemperature() > 75.0) {
            tempPenalty = Math.min(15.0, (metric.getCpuTemperature() - 75.0) * 0.75);
        }
        score -= tempPenalty;

        // 5. Offline Time Penalty (Max 15 pts)
        double offlinePenalty = 0.0;
        if (computer.getLastSeenAt() != null) {
            long offlineSeconds = Duration.between(computer.getLastSeenAt(), Instant.now()).getSeconds();
            if (offlineSeconds > 60) {
                offlinePenalty = Math.min(15.0, (offlineSeconds - 60) * 0.1);
            }
        }
        score -= offlinePenalty;

        // 6. Crash Probability Penalty (Max 10 pts)
        double crashPenalty = 0.0;
        if (crashProbability != null) {
            crashPenalty = Math.min(10.0, crashProbability * 10.0);
        }
        score -= crashPenalty;

        double finalScore = Math.max(0.0, Math.min(100.0, Math.round(score * 10.0) / 10.0));

        HealthCategory category;
        if (finalScore >= 80.0) {
            category = HealthCategory.Healthy;
        } else if (finalScore >= 50.0) {
            category = HealthCategory.Warning;
        } else {
            category = HealthCategory.Critical;
        }

        HealthScore healthScore = HealthScore.builder()
                .computer(computer)
                .overallScore(finalScore)
                .cpuHealth(Math.max(0.0, 100.0 - (cpuPenalty * 4)))
                .memoryHealth(Math.max(0.0, 100.0 - (ramPenalty * 5)))
                .diskHealth(Math.max(0.0, 100.0 - (diskPenalty * 6.66)))
                .networkHealth(100.0)
                .category(category)
                .calculatedAt(Instant.now())
                .build();

        healthScore = healthScoreRepository.save(healthScore);

        HealthScoreDto dto = HealthScoreDto.builder()
                .id(healthScore.getId())
                .computerId(computer.getId())
                .hostname(computer.getHostname())
                .overallScore(healthScore.getOverallScore())
                .cpuHealth(healthScore.getCpuHealth())
                .memoryHealth(healthScore.getMemoryHealth())
                .diskHealth(healthScore.getDiskHealth())
                .networkHealth(healthScore.getNetworkHealth())
                .category(healthScore.getCategory().name())
                .calculatedAt(healthScore.getCalculatedAt())
                .build();

        latestHealthScoreCache.put(computer.getId(), dto);
        return dto;
    }

    @Override
    @Transactional(readOnly = true)
    public HealthScoreDto getLatestHealthScore(String computerId) {
        if (computerId != null && latestHealthScoreCache.containsKey(computerId)) {
            return latestHealthScoreCache.get(computerId);
        }

        HealthScore score = healthScoreRepository.findLatestByComputerId(computerId)
                .orElse(null);

        if (score == null) {
            HealthScoreDto defaultScore = HealthScoreDto.builder()
                    .computerId(computerId)
                    .overallScore(100.0)
                    .category(HealthCategory.Healthy.name())
                    .calculatedAt(Instant.now())
                    .build();
            if (computerId != null) latestHealthScoreCache.put(computerId, defaultScore);
            return defaultScore;
        }

        HealthScoreDto dto = HealthScoreDto.builder()
                .id(score.getId())
                .computerId(computerId)
                .hostname(score.getComputer().getHostname())
                .overallScore(score.getOverallScore())
                .cpuHealth(score.getCpuHealth())
                .memoryHealth(score.getMemoryHealth())
                .diskHealth(score.getDiskHealth())
                .networkHealth(score.getNetworkHealth())
                .category(score.getCategory().name())
                .calculatedAt(score.getCalculatedAt())
                .build();

        if (computerId != null) latestHealthScoreCache.put(computerId, dto);
        return dto;
    }
}
