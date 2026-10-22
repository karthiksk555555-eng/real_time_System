package com.neurosys.backend.service;

import com.neurosys.backend.dto.request.CreateLabRequest;
import com.neurosys.backend.dto.request.GenerateEnrollmentCodeRequest;
import com.neurosys.backend.dto.response.ComputerDto;
import com.neurosys.backend.dto.response.LabDto;
import com.neurosys.backend.dto.response.LabEnrollmentCodeDto;

import java.util.List;

public interface LabService {
    List<LabDto> getAllLabs();
    LabDto getLabById(String id);
    LabDto createLab(CreateLabRequest request);
    LabEnrollmentCodeDto generateEnrollmentCode(String labId, GenerateEnrollmentCodeRequest request, String createdBy);
    List<LabEnrollmentCodeDto> getEnrollmentCodesForLab(String labId);
    ComputerDto assignComputerToLab(String computerId, String labId);
    List<ComputerDto> getUnassignedComputers();
    void deleteLab(String id);
}
