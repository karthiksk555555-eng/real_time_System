package com.neurosys.backend.repository;

import com.neurosys.backend.entity.Computer;
import com.neurosys.backend.enums.ComputerStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface ComputerRepository extends JpaRepository<Computer, String> {
    Optional<Computer> findByAgentId(String agentId);
    Optional<Computer> findByMacAddress(String macAddress);
    Optional<Computer> findByHostnameIgnoreCase(String hostname);
    List<Computer> findByStatus(ComputerStatus status);
    List<Computer> findByLabName(String labName);
    List<Computer> findByLabId(String labId);
    List<Computer> findByLabIdAndStatus(String labId, ComputerStatus status);
    List<Computer> findByLabIsNull();
    long countByStatus(ComputerStatus status);
    long countByLabId(String labId);
    long countByLabIdAndStatus(String labId, ComputerStatus status);

    @Query("SELECT c FROM Computer c WHERE c.status = 'ONLINE' AND c.lastSeenAt < :threshold")
    List<Computer> findStaleOnlineComputers(Instant threshold);

    @Query("SELECT c FROM Computer c LEFT JOIN FETCH c.lab WHERE c.status NOT IN ('PENDING', 'REJECTED')")
    List<Computer> findAllApprovedWithLab();

    @Query("SELECT c FROM Computer c LEFT JOIN FETCH c.lab WHERE c.lab.id = :labId AND c.status NOT IN ('PENDING', 'REJECTED')")
    List<Computer> findByLabIdWithLab(@org.springframework.data.repository.query.Param("labId") String labId);
}
