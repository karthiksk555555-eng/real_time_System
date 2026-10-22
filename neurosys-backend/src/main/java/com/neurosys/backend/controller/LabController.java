package com.neurosys.backend.controller;

import com.neurosys.backend.dto.request.CreateLabRequest;
import com.neurosys.backend.dto.request.GenerateEnrollmentCodeRequest;
import com.neurosys.backend.dto.response.ApiResponse;
import com.neurosys.backend.dto.response.ComputerDto;
import com.neurosys.backend.dto.response.LabDto;
import com.neurosys.backend.dto.response.LabEnrollmentCodeDto;
import com.neurosys.backend.service.LabService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.List;

@RestController
@RequestMapping("/api/v1/labs")
@RequiredArgsConstructor
@Tag(name = "Lab Management Endpoint", description = "REST API for multi-lab management, lab enrollment codes, and workstation lab assignments")
public class LabController {

    private final LabService labService;

    @GetMapping
    @Operation(summary = "Get All Computer Labs", description = "Retrieve list of all registered computer labs with real-time workstation counts")
    public ResponseEntity<ApiResponse<List<LabDto>>> getAllLabs() {
        List<LabDto> labs = labService.getAllLabs();
        return ResponseEntity.ok(ApiResponse.success("Labs fetched successfully", labs));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get Lab Details by ID", description = "Retrieve single lab profile and current counts")
    public ResponseEntity<ApiResponse<LabDto>> getLabById(@PathVariable String id) {
        LabDto lab = labService.getLabById(id);
        return ResponseEntity.ok(ApiResponse.success("Lab details fetched successfully", lab));
    }

    @PostMapping
    @Operation(summary = "Create New Computer Lab", description = "Register a new laboratory room in the college platform")
    public ResponseEntity<ApiResponse<LabDto>> createLab(@Valid @RequestBody CreateLabRequest request) {
        LabDto created = labService.createLab(request);
        return ResponseEntity.ok(ApiResponse.success("Computer Lab created successfully", created));
    }

    @PostMapping("/{id}/enrollment-code")
    @Operation(summary = "Generate Secure Agent Enrollment Code", description = "Generate a time-limited token for enrolling new Windows agents into this lab")
    public ResponseEntity<ApiResponse<LabEnrollmentCodeDto>> generateEnrollmentCode(
            @PathVariable String id,
            @RequestBody(required = false) GenerateEnrollmentCodeRequest request,
            Principal principal) {
        String createdBy = principal != null ? principal.getName() : "admin";
        LabEnrollmentCodeDto code = labService.generateEnrollmentCode(id, request, createdBy);
        return ResponseEntity.ok(ApiResponse.success("Enrollment code generated successfully", code));
    }

    @GetMapping("/{id}/enrollment-codes")
    @Operation(summary = "Get Active Enrollment Codes for Lab", description = "Retrieve list of active enrollment tokens for a specific lab")
    public ResponseEntity<ApiResponse<List<LabEnrollmentCodeDto>>> getEnrollmentCodesForLab(@PathVariable String id) {
        List<LabEnrollmentCodeDto> codes = labService.getEnrollmentCodesForLab(id);
        return ResponseEntity.ok(ApiResponse.success("Enrollment codes retrieved successfully", codes));
    }

    @GetMapping("/unassigned-computers")
    @Operation(summary = "Get Unassigned Workstations", description = "Retrieve list of registered computers not currently assigned to any lab")
    public ResponseEntity<ApiResponse<List<ComputerDto>>> getUnassignedComputers() {
        List<ComputerDto> unassigned = labService.getUnassignedComputers();
        return ResponseEntity.ok(ApiResponse.success("Unassigned computers fetched successfully", unassigned));
    }

    @PutMapping("/assign-computer/{computerId}/to/{labId}")
    @Operation(summary = "Assign Workstation to Lab", description = "Assign or reassign an existing computer workstation to a target computer lab")
    public ResponseEntity<ApiResponse<ComputerDto>> assignComputerToLab(
            @PathVariable String computerId,
            @PathVariable String labId) {
        ComputerDto updated = labService.assignComputerToLab(computerId, labId);
        return ResponseEntity.ok(ApiResponse.success("Computer workstation assigned to lab successfully", updated));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete Computer Lab", description = "Delete a computer lab by ID, unassigning any connected workstations")
    public ResponseEntity<ApiResponse<Void>> deleteLab(@PathVariable String id) {
        labService.deleteLab(id);
        return ResponseEntity.ok(ApiResponse.success("Computer Lab deleted successfully", null));
    }
}
