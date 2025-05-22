
// src/dtos/osha-inspection.dto.ts
import { IsString, IsOptional, IsEnum, IsArray, IsDateString, IsMongoId, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

import { 
    InspectionType, 
    InspectionResult, 
    InspectionStatus
  } from '../schemas/osha-inspection.schema';
  
  class ViolationDetailDto {
    @ApiProperty({ description: 'Type of violation' })
    @IsString()
    violationType: string;
  
    @ApiProperty({ description: 'Description of the violation' })
    @IsString()
    description: string;
  
    @ApiProperty({ 
      enum: ['high', 'medium', 'low'], 
      description: 'Severity of the violation' 
    })
    @IsEnum(['high', 'medium', 'low'])
    severity: 'high' | 'medium' | 'low';
  
    @ApiPropertyOptional({ description: 'OSHA regulation that was violated' })
    @IsOptional()
    @IsString()
    regulationViolated?: string;
  
    @ApiPropertyOptional({ description: 'Immediate action required' })
    @IsOptional()
    @IsString()
    immediateAction?: string;
  }
  
  class WeatherConditionsDto {
    @ApiPropertyOptional({ description: 'Temperature in Celsius' })
    @IsOptional()
    @Type(() => Number)
    temperature?: number;
  
    @ApiPropertyOptional({ description: 'Humidity percentage' })
    @IsOptional()
    @Type(() => Number)
    humidity?: number;
  
    @ApiPropertyOptional({ description: 'Wind speed in km/h' })
    @IsOptional()
    @Type(() => Number)
    windSpeed?: number;
  
    @ApiPropertyOptional({ description: 'Precipitation conditions' })
    @IsOptional()
    @IsString()
    precipitation?: string;
  
    @ApiPropertyOptional({ description: 'Visibility conditions' })
    @IsOptional()
    @IsString()
    visibility?: string;
  }
  
  export class CreateOshaInspectionDto {
    @ApiProperty({ description: 'OSHA compliance requirement being inspected' })
    @IsMongoId()
    oshaComplianceRequirementId: string;
  
    @ApiProperty({ description: 'Employee conducting the inspection' })
    @IsMongoId()
    inspectorId: string;
  
    @ApiProperty({ description: 'Date and time of inspection' })
    @IsDateString()
    inspectionDate: string;
  
    @ApiProperty({ 
      enum: InspectionType, 
      description: 'Type of inspection being conducted' 
    })
    @IsEnum(InspectionType)
    inspectionType: InspectionType;
  
    @ApiPropertyOptional({ 
      enum: InspectionResult, 
      description: 'Result of the inspection' 
    })
    @IsOptional()
    @IsEnum(InspectionResult)
    result?: InspectionResult;
  
    @ApiPropertyOptional({ description: 'Number of violations found' })
    @IsOptional()
    @Type(() => Number)
    violationsFound?: number;
  
    @ApiPropertyOptional({ 
      type: [ViolationDetailDto], 
      description: 'Details of violations found' 
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ViolationDetailDto)
    violationsDetails?: ViolationDetailDto[];
  
    @ApiPropertyOptional({ 
      type: [String], 
      description: 'Required corrective actions' 
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    correctiveActions?: string[];
  
    @ApiPropertyOptional({ description: 'Deadline for corrective actions' })
    @IsOptional()
    @IsDateString()
    correctiveActionsDueDate?: string;
  
    @ApiPropertyOptional({ description: 'Whether follow-up inspection is required' })
    @IsOptional()
    @IsBoolean()
    followUpRequired?: boolean;
  
    @ApiPropertyOptional({ description: 'Date for next inspection' })
    @IsOptional()
    @IsDateString()
    nextInspectionDate?: string;
  
    @ApiPropertyOptional({ description: 'Inspector notes and observations' })
    @IsOptional()
    @IsString()
    inspectorNotes?: string;
  
    @ApiPropertyOptional({ 
      type: [String], 
      description: 'URLs to inspection photos' 
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    photos?: string[];
  
    @ApiPropertyOptional({ 
      type: [String], 
      description: 'URLs to inspection documents' 
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    documents?: string[];
  
    @ApiPropertyOptional({ 
      description: 'Safety rating from 0-5', 
      minimum: 0, 
      maximum: 5 
    })
    @IsOptional()
    @Type(() => Number)
    safetyRating?: number;
  
    @ApiPropertyOptional({ 
      type: WeatherConditionsDto, 
      description: 'Weather conditions during inspection' 
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => WeatherConditionsDto)
    weatherConditions?: WeatherConditionsDto;
  
    @ApiPropertyOptional({ description: 'Inspection start time' })
    @IsOptional()
    @IsDateString()
    inspectionStartTime?: string;
  
    @ApiPropertyOptional({ description: 'Inspection end time' })
    @IsOptional()
    @IsDateString()
    inspectionEndTime?: string;
  
    @ApiPropertyOptional({ description: 'Duration in minutes' })
    @IsOptional()
    @Type(() => Number)
    inspectionDuration?: number;
  }
  
  export class UpdateOshaInspectionDto extends PartialType(CreateOshaInspectionDto) {
    @ApiPropertyOptional({ 
      enum: InspectionStatus, 
      description: 'Current status of the inspection' 
    })
    @IsOptional()
    @IsEnum(InspectionStatus)
    status?: InspectionStatus;
  }