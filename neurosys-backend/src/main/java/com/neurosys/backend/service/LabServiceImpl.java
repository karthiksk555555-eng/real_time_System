package com.neurosys.backend.service;

import com.neurosys.backend.dto.request.CreateLabRequest;
import com.neurosys.backend.dto.request.GenerateEnrollmentCodeRequest;
import com.neurosys.backend.dto.response.ComputerDto;
import com.neurosys.backend.dto.response.LabDto;
import com.neurosys.backend.dto.response.LabEnrollmentCodeDto;
import com.neurosys.backend.entity.Computer;
import com.neurosys.backend.entity.Lab;
import com.neurosys.backend.entity.LabEnrollmentCode;
import com.neurosys.backend.enums.ComputerStatus;
import com.neurosys.backend.exception.ResourceNotFoundException;
import com.neurosys.backend.entity.SoftwareDeployment;
import com.neurosys.backend.repository.ComputerRepository;
import com.neurosys.backend.repository.LabEnrollmentCodeRepository;
import com.neurosys.backend.repository.LabRepository;
import com.neurosys.backend.repository.SoftwareDeploymentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class LabServiceImpl implements LabService {

    private final LabRepository labRepository;
    private final LabEnrollmentCodeRepository enrollmentCodeRepository;
    private final ComputerRepository computerRepository;
    private final ComputerService computerService;
    private final SoftwareDeploymentRepository softwareDeploymentRepository;

    private static final String ALPHANUMERIC = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    private final SecureRandom random = new SecureRandom();

    @Override
    @Transactional(readOnly = true)
    public List<LabDto> getAllLabs() {
        List<Lab> labs = labRepository.findAll();
        return labs.stream().map(this::mapToDto).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public LabDto getLabById(String id) {
        Lab lab = labRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Lab", "id", id));
        return mapToDto(lab);
    }

    @Override
    @Transactional
    public LabDto createLab(CreateLabRequest request) {
        String cleanCode = request.getCode().trim().toUpperCase();
        if (labRepository.existsByCodeIgnoreCase(cleanCode)) {
            throw new IllegalArgumentException("Lab code already exists.");
        }

        Lab lab = Lab.builder()
                .name(request.getName().trim())
                .code(cleanCode)
                .location(request.getLocation() != null ? request.getLocation().trim() : "")
                .description(request.getDescription() != null ? request.getDescription().trim() : "")
                .status("ACTIVE")
                .createdAt(Instant.now())
                .build();

        lab = labRepository.save(lab);
        log.info("[INFO] Created new Computer Lab: Name={}, Code={}", lab.getName(), lab.getCode());

        // Automatically initialize a unique lab-specific agent enrollment configuration & token
        try {
            generateEnrollmentCode(lab.getId(), null, "system");
        } catch (Exception e) {
            log.warn("Could not auto-generate initial enrollment token for lab {}", lab.getCode(), e);
        }

        return mapToDto(lab);
    }

    @Override
    @Transactional
    public LabEnrollmentCodeDto generateEnrollmentCode(String labId, GenerateEnrollmentCodeRequest request, String createdBy) {
        Lab lab = labRepository.findById(labId)
                .orElseThrow(() -> new ResourceNotFoundException("Lab", "id", labId));

        int expHours = (request != null && request.getExpirationHours() != null && request.getExpirationHours() > 0)
                ? request.getExpirationHours() : 72; // Default 72 hours
        int maxUses = (request != null && request.getMaxUses() != null && request.getMaxUses() > 0)
                ? request.getMaxUses() : 100;

        String codeStr = generateRandomCode(lab.getCode());

        LabEnrollmentCode code = LabEnrollmentCode.builder()
                .code(codeStr)
                .lab(lab)
                .createdBy(createdBy != null ? createdBy : "admin")
                .expiresAt(Instant.now().plus(expHours, ChronoUnit.HOURS))
                .maxUses(maxUses)
                .currentUses(0)
                .revoked(false)
                .createdAt(Instant.now())
                .build();

        code = enrollmentCodeRepository.save(code);
        log.info("[INFO] Generated enrollment code {} for Lab ID={}", code.getCode(), labId);

        return mapToCodeDto(code);
    }

    @Override
    @Transactional(readOnly = true)
    public List<LabEnrollmentCodeDto> getEnrollmentCodesForLab(String labId) {
        return enrollmentCodeRepository.findByLabIdOrderByCreatedAtDesc(labId).stream()
                .map(this::mapToCodeDto)
                .toList();
    }

    @Override
    @Transactional
    public ComputerDto assignComputerToLab(String computerId, String labId) {
        Computer computer = computerRepository.findById(computerId)
                .orElseThrow(() -> new ResourceNotFoundException("Computer", "id", computerId));

        Lab lab = labRepository.findById(labId)
                .orElseThrow(() -> new ResourceNotFoundException("Lab", "id", labId));

        computer.setLab(lab);
        computer.setLabName(lab.getName());
        computerRepository.save(computer);

        log.info("[INFO] Computer {} (ID={}) assigned to Lab {} (ID={})", computer.getHostname(), computerId, lab.getName(), labId);
        return computerService.getComputerById(computerId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ComputerDto> getUnassignedComputers() {
        return computerRepository.findByLabIsNull().stream()
                .map(computer -> computerService.getComputerById(computer.getId()))
                .toList();
    }

    @Override
    @Transactional
    public void deleteLab(String id) {
        Lab lab = labRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Lab", "id", id));

        // 1. Clean up any software deployment tasks targeting this lab
        List<SoftwareDeployment> deployments = softwareDeploymentRepository.findByLabIdOrderByCreatedAtDesc(id);
        if (deployments != null && !deployments.isEmpty()) {
            softwareDeploymentRepository.deleteAll(deployments);
        }

        // 2. Clean up any enrollment codes generated for this lab
        List<LabEnrollmentCode> codes = enrollmentCodeRepository.findByLabId(id);
        if (codes != null && !codes.isEmpty()) {
            enrollmentCodeRepository.deleteAll(codes);
        }

        // 3. Unassign all computers currently assigned to this lab
        List<Computer> computers = computerRepository.findByLabId(id);
        if (computers != null && !computers.isEmpty()) {
            for (Computer c : computers) {
                c.setLab(null);
                c.setLabName(null);
            }
            computerRepository.saveAll(computers);
        }

        // 4. Delete the lab entity
        labRepository.delete(lab);
        log.info("[INFO] Lab {} (ID={}) deleted successfully. Unassigned {} computers.", lab.getName(), id, computers != null ? computers.size() : 0);
    }

    private String generateRandomCode(String labCode) {
        String cleanPrefix = (labCode != null && !labCode.isEmpty()) ? labCode.replaceAll("[^A-Za-z0-9]", "") : "LAB1";
        StringBuilder sb = new StringBuilder("NS-" + cleanPrefix + "-");
        for (int i = 0; i < 6; i++) {
            sb.append(ALPHANUMERIC.charAt(random.nextInt(ALPHANUMERIC.length())));
        }
        return sb.toString().toUpperCase();
    }

    private LabDto mapToDto(Lab lab) {
        long total = computerRepository.countByLabId(lab.getId());
        long online = computerRepository.countByLabIdAndStatus(lab.getId(), ComputerStatus.ONLINE);
        long warning = computerRepository.countByLabIdAndStatus(lab.getId(), ComputerStatus.WARNING);
        long critical = computerRepository.countByLabIdAndStatus(lab.getId(), ComputerStatus.CRITICAL);
        long offline = computerRepository.countByLabIdAndStatus(lab.getId(), ComputerStatus.OFFLINE);
        long needsAttention = warning + critical;

        return LabDto.builder()
                .id(lab.getId())
                .name(lab.getName())
                .code(lab.getCode())
                .location(lab.getLocation())
                .description(lab.getDescription())
                .status(lab.getStatus())
                .totalComputers(total)
                .onlineComputers(online)
                .offlineComputers(offline)
                .needsAttentionComputers(needsAttention)
                .createdAt(lab.getCreatedAt())
                .build();
    }

    private LabEnrollmentCodeDto mapToCodeDto(LabEnrollmentCode code) {
        return LabEnrollmentCodeDto.builder()
                .id(code.getId())
                .code(code.getCode())
                .labId(code.getLab().getId())
                .labName(code.getLab().getName())
                .createdBy(code.getCreatedBy())
                .expiresAt(code.getExpiresAt())
                .maxUses(code.getMaxUses())
                .currentUses(code.getCurrentUses())
                .revoked(code.getRevoked())
                .createdAt(code.getCreatedAt())
                .build();
    }
}
