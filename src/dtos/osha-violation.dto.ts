// src/dtos/osha-violation.dto.ts
import { IsString, IsOptional, IsEnum, IsArray, IsDateString, IsMongoId, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import { 
    ViolationType, 
    ViolationSeverity, 
    ViolationStatus 
  } from '../schemas/osha-violation.schema';
  
  export class CreateOshaViolationDto {
    @ApiProperty({ description: 'Inspection where this violation was found' })
    @IsMongoId()
    oshaInspectionId: string;
  
    @ApiPropertyOptional({ description: 'Related compliance requirement' })
    @IsOptional()
    @IsMongoId()
    oshaComplianceRequirementId?: string;
  
    @ApiProperty({ 
      enum: ViolationType, 
      description: 'Type of OSHA violation' 
    })
    @IsEnum(ViolationType)
    violationType: ViolationType;
  
    @ApiPropertyOptional({ description: 'Specific OSHA regulation violated' })
    @IsOptional()
    @IsString()
    regulationViolated?: string;
  
    @ApiProperty({ description: 'Description of the violation' })
    @IsString()
    description: string;
  
    @ApiProperty({ 
      enum: ViolationSeverity, 
      description: 'Severity level of the violation' 
    })
    @IsEnum(ViolationSeverity)
    severity: ViolationSeverity;
  
    @ApiPropertyOptional({ description: 'Required corrective action' })
    @IsOptional()
    @IsString()
    correctiveAction?: string;
  
    @ApiPropertyOptional({ description: 'Deadline for correction' })
    @IsOptional()
    @IsDateString()
    correctionDeadline?: string;
  
    @ApiPropertyOptional({ description: 'Date when violation was corrected' })
    @IsOptional()
    @IsDateString()
    correctedDate?: string;
  
    @ApiPropertyOptional({ description: 'Fine amount if applicable' })
    @IsOptional()
    @Type(() => Number)
    fineAmount?: number;
  
    @ApiPropertyOptional({ description: 'Additional notes about the violation' })
    @IsOptional()
    @IsString()
    notes?: string;
  
    @ApiPropertyOptional({ description: 'Employee assigned to fix the violation' })
    @IsOptional()
    @IsMongoId()
    assignedTo?: string;
  
    @ApiPropertyOptional({ description: 'Employee who reported the violation' })
    @IsOptional()
    @IsMongoId()
    reportedBy?: string;
  
    @ApiPropertyOptional({ 
      type: [String], 
      description: 'Photos showing the violation' 
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    evidencePhotos?: string[];
  
    @ApiPropertyOptional({ 
      type: [String], 
      description: 'Documents related to correction' 
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    correctionDocuments?: string[];
  
    @ApiPropertyOptional({ description: 'Follow-up date' })
    @IsOptional()
    @IsDateString()
    followUpDate?: string;
  
    @ApiPropertyOptional({ description: 'Follow-up notes' })
    @IsOptional()
    @IsString()
    followUpNotes?: string;
  
    @ApiPropertyOptional({ description: 'Whether follow-up inspection is required' })
    @IsOptional()
    @IsBoolean()
    requiresFollowUpInspection?: boolean;
  }
  
  export class UpdateOshaViolationDto extends PartialType(CreateOshaViolationDto) {}
  
  export class OshaViolationQueryDto {
    @ApiPropertyOptional({ description: 'Filter by inspection ID' })
    @IsOptional()
    @IsMongoId()
    oshaInspectionId?: string;
  
    @ApiPropertyOptional({ description: 'Filter by compliance requirement' })
    @IsOptional()
    @IsMongoId()
    oshaComplianceRequirementId?: string;
  
    @ApiPropertyOptional({ enum: ViolationType })
    @IsOptional()
    @IsEnum(ViolationType)
    violationType?: ViolationType;
  
    @ApiPropertyOptional({ enum: ViolationSeverity })
    @IsOptional()
    @IsEnum(ViolationSeverity)
    severity?: ViolationSeverity;
  
    @ApiPropertyOptional({ enum: ViolationStatus })
    @IsOptional()
    @IsEnum(ViolationStatus)
    status?: ViolationStatus;
  
    @ApiPropertyOptional({ description: 'Filter by assigned employee' })
    @IsOptional()
    @IsMongoId()
    assignedTo?: string;
  
    @ApiPropertyOptional({ description: 'Show only overdue violations' })
    @IsOptional()
    @IsBoolean()
    overdue?: boolean;
  
    @ApiPropertyOptional({ description: 'Show only violations requiring follow-up' })
    @IsOptional()
    @IsBoolean()
    requiresFollowUp?: boolean;
  }