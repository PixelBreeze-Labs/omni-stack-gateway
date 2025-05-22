// src/dtos/osha-compliance-requirement.dto.ts
import { IsString, IsOptional, IsEnum, IsArray, IsDateString, IsMongoId, IsBoolean, ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { 
  OshaComplianceCategory, 
  OshaComplianceType, 
  OshaCompliancePriority, 
  OshaComplianceFrequency 
} from '../schemas/osha-compliance-requirement.schema';

export class CreateOshaComplianceRequirementDto {
  @ApiProperty({ description: 'Business ID that owns this requirement' })
  @IsMongoId()
  businessId: string;

  @ApiPropertyOptional({ description: 'Construction site ID if site-specific' })
  @IsOptional()
  @IsMongoId()
  constructionSiteId?: string;

  @ApiProperty({ description: 'Title of the compliance requirement' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Detailed description of the requirement' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ 
    enum: OshaComplianceCategory, 
    description: 'Category of compliance requirement' 
  })
  @IsEnum(OshaComplianceCategory)
  category: OshaComplianceCategory;

  @ApiProperty({ 
    enum: OshaComplianceType, 
    description: 'Type of compliance requirement' 
  })
  @IsEnum(OshaComplianceType)
  complianceType: OshaComplianceType;

  @ApiProperty({ 
    enum: OshaCompliancePriority, 
    description: 'Priority level of the requirement' 
  })
  @IsEnum(OshaCompliancePriority)
  priority: OshaCompliancePriority;

  @ApiPropertyOptional({ description: 'OSHA regulation reference number' })
  @IsOptional()
  @IsString()
  regulationReference?: string;

  @ApiProperty({ 
    enum: OshaComplianceFrequency, 
    description: 'How often this requirement needs to be checked' 
  })
  @IsEnum(OshaComplianceFrequency)
  frequency: OshaComplianceFrequency;

  @ApiPropertyOptional({ description: 'Date of last inspection' })
  @IsOptional()
  @IsDateString()
  lastInspectionDate?: string;

  @ApiPropertyOptional({ description: 'Date of next scheduled inspection' })
  @IsOptional()
  @IsDateString()
  nextInspectionDate?: string;

  @ApiPropertyOptional({ description: 'Employee assigned to this requirement' })
  @IsOptional()
  @IsMongoId()
  assignedTo?: string;

  @ApiPropertyOptional({ 
    type: [String], 
    description: 'List of specific requirements' 
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requirements?: string[];

  @ApiPropertyOptional({ 
    type: [String], 
    description: 'List of required actions if non-compliant' 
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredActions?: string[];

  @ApiPropertyOptional({ 
    type: [String], 
    description: 'Links to documentation' 
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentationLinks?: string[];

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Whether this requirement is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateOshaComplianceRequirementDto extends PartialType(CreateOshaComplianceRequirementDto) {}

export class OshaComplianceRequirementQueryDto {
  @ApiPropertyOptional({ description: 'Filter by business ID' })
  @IsOptional()
  @IsMongoId()
  businessId?: string;

  @ApiPropertyOptional({ description: 'Filter by construction site ID' })
  @IsOptional()
  @IsMongoId()
  constructionSiteId?: string;

  @ApiPropertyOptional({ enum: OshaComplianceCategory })
  @IsOptional()
  @IsEnum(OshaComplianceCategory)
  category?: OshaComplianceCategory;

  @ApiPropertyOptional({ enum: OshaComplianceType })
  @IsOptional()
  @IsEnum(OshaComplianceType)
  complianceType?: OshaComplianceType;

  @ApiPropertyOptional({ enum: OshaCompliancePriority })
  @IsOptional()
  @IsEnum(OshaCompliancePriority)
  priority?: OshaCompliancePriority;

  @ApiPropertyOptional({ description: 'Filter by assigned employee' })
  @IsOptional()
  @IsMongoId()
  assignedTo?: string;

  @ApiPropertyOptional({ description: 'Page number for pagination' })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page for pagination' })
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}