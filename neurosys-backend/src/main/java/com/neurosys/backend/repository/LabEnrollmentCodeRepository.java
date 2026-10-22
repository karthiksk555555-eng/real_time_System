package com.neurosys.backend.repository;

import com.neurosys.backend.entity.LabEnrollmentCode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface LabEnrollmentCodeRepository extends JpaRepository<LabEnrollmentCode, String> {
    Optional<LabEnrollmentCode> findByCodeIgnoreCase(String code);
    List<LabEnrollmentCode> findByLabId(String labId);
    List<LabEnrollmentCode> findByLabIdOrderByCreatedAtDesc(String labId);
}
