// src/dtos/osha-equipment-compliance.dto.ts
import { IsString, IsOptional, IsEnum, IsArray, IsDateString, IsMongoId } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { EquipmentType } from '../schemas/osha-equipment-compliance.schema';
  
  export class CreateOshaEquipmentComplianceDto {
    @ApiProperty({ description: 'OSHA compliance requirement this equipment belongs to' })
    @IsMongoId()
    oshaComplianceRequirementId: string;
  
    @ApiPropertyOptional({ description: 'Equipment ID if exists in system' })
    @IsOptional()
    @IsMongoId()
    equipmentId?: string;
  
    @ApiProperty({ 
      enum: EquipmentType, 
      description: 'Type of equipment' 
    })
    @IsEnum(EquipmentType)
    equipmentType: EquipmentType;
  
    @ApiPropertyOptional({ description: 'Name/description of the equipment' })
    @IsOptional()
    @IsString()
    equipmentName?: string;
  
    @ApiPropertyOptional({ description: 'Serial number of the equipment' })
    @IsOptional()
    @IsString()
    serialNumber?: string;
  
    @ApiPropertyOptional({ description: 'Equipment manufacturer' })
    @IsOptional()
    @IsString()
    manufacturer?: string;
  
    @ApiPropertyOptional({ description: 'Equipment model' })
    @IsOptional()
    @IsString()
    equipmentModel?: string;
  
    @ApiPropertyOptional({ description: 'Certification number' })
    @IsOptional()
    @IsString()
    certificationNumber?: string;
  
    @ApiPropertyOptional({ description: 'When certification expires' })
    @IsOptional()
    @IsDateString()
    certificationExpiry?: string;
  
    @ApiPropertyOptional({ description: 'Last maintenance date' })
    @IsOptional()
    @IsDateString()
    lastMaintenanceDate?: string;
  
    @ApiPropertyOptional({ description: 'Next scheduled maintenance date' })
    @IsOptional()
    @IsDateString()
    nextMaintenanceDate?: string;
  
    @ApiPropertyOptional({ description: 'Last inspection date' })
    @IsOptional()
    @IsDateString()
    lastInspectionDate?: string;
  
    @ApiPropertyOptional({ description: 'Next scheduled inspection date' })
    @IsOptional()
    @IsDateString()
    nextInspectionDate?: string;
  
    @ApiPropertyOptional({ description: 'Notes from inspections' })
    @IsOptional()
    @IsString()
    inspectionNotes?: string;
  
    @ApiPropertyOptional({ description: 'Notes from maintenance' })
    @IsOptional()
    @IsString()
    maintenanceNotes?: string;
  
    @ApiPropertyOptional({ 
      type: [String], 
      description: 'URLs to inspection photos' 
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    inspectionPhotos?: string[];
  
    @ApiPropertyOptional({ 
      type: [String], 
      description: 'URLs to maintenance documents' 
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    maintenanceDocuments?: string[];
  
    @ApiPropertyOptional({ 
      type: [String], 
      description: 'URLs to certification documents' 
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    certificationDocuments?: string[];
  }
  
  export class UpdateOshaEquipmentComplianceDto extends PartialType(CreateOshaEquipmentComplianceDto) {}  