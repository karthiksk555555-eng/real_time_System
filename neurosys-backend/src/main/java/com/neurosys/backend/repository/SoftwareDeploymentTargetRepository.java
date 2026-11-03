package com.neurosys.backend.repository;

import com.neurosys.backend.entity.SoftwareDeploymentTarget;
import com.neurosys.backend.enums.DeploymentTargetStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface SoftwareDeploymentTargetRepository extends JpaRepository<SoftwareDeploymentTarget, String> {
    Optional<SoftwareDeploymentTarget> findByDeploymentIdAndComputerId(String deploymentId, String computerId);
    Optional<SoftwareDeploymentTarget> findByDeploymentIdAndComputerAgentId(String deploymentId, String agentId);
    List<SoftwareDeploymentTarget> findByDeploymentId(String deploymentId);
    
    @Query("SELECT t FROM SoftwareDeploymentTarget t WHERE (t.computer.agentId = :agentId OR LOWER(t.computer.hostname) = LOWER(:agentId) OR t.computer.id = :agentId) AND t.status IN :statuses AND t.deployment.status IN ('PENDING', 'IN_PROGRESS')")
    List<SoftwareDeploymentTarget> findPendingTasksForAgent(@Param("agentId") String agentId, @Param("statuses") Collection<DeploymentTargetStatus> statuses);

    @Query("SELECT t FROM SoftwareDeploymentTarget t WHERE t.deployment.id = :deploymentId AND (t.computer.agentId = :agentId OR LOWER(t.computer.hostname) = LOWER(:agentId) OR t.computer.id = :agentId)")
    List<SoftwareDeploymentTarget> findByDeploymentIdAndAgentOrHostnameOrId(@Param("deploymentId") String deploymentId, @Param("agentId") String agentId);

    @Query("SELECT t FROM SoftwareDeploymentTarget t WHERE t.status IN :statuses AND t.deployment.expiresAt < :now")
    List<SoftwareDeploymentTarget> findExpiredTargets(@Param("statuses") Collection<DeploymentTargetStatus> statuses, @Param("now") Instant now);

    @Query("SELECT t FROM SoftwareDeploymentTarget t WHERE t.status IN :statuses AND t.startedAt < :threshold")
    List<SoftwareDeploymentTarget> findStaleActiveTargets(@Param("statuses") Collection<DeploymentTargetStatus> statuses, @Param("threshold") Instant threshold);
}
