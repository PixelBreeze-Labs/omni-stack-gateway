// src/dtos/business-skills.dto.ts
import { IsOptional, IsBoolean, IsArray, IsString, IsNumber, Min, Max, ValidateNested, IsEnum, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BusinessIndustry, BusinessSubCategory, BusinessSkillRequirement, BusinessType, BusinessOperationType, AgentFeatureFlag, SubscriptionStatus } from '../schemas/business.schema';
import { Currency } from '../enums/currency.enum';

// ============================================================================
// ADDRESS DTOs (NEW)
// ============================================================================

// Address DTO for business address management
export class AddressDto {
  @ApiPropertyOptional({ description: 'Street address' })
  @IsOptional()
  @IsString()
  street?: string;

  @ApiPropertyOptional({ description: 'City ID from location service' })
  @IsOptional()
  @IsString()
  cityId?: string;

  @ApiPropertyOptional({ description: 'State ID from location service' })
  @IsOptional()
  @IsString()
  stateId?: string;

  @ApiPropertyOptional({ description: 'Country ID from location service' })
  @IsOptional()
  @IsString()
  countryId?: string;

  @ApiPropertyOptional({ description: 'Postal/ZIP code' })
  @IsOptional()
  @IsString()
  zip?: string;

  @ApiPropertyOptional({ description: 'Additional address line' })
  @IsOptional()
  @IsString()
  addressLine2?: string;
}

// Address Response DTO
export class AddressResponse {
  @ApiProperty({ description: 'Address ID' })
  id?: string;

  @ApiProperty({ description: 'Street address' })
  street?: string;

  @ApiProperty({ description: 'City information' })
  city?: {
    id: string;
    name: string;
  };

  @ApiProperty({ description: 'State information' })
  state?: {
    id: string;
    name: string;
  };

  @ApiProperty({ description: 'Country information' })
  country?: {
    id: string;
    name: string;
    code: string;
  };

  @ApiProperty({ description: 'Postal/ZIP code' })
  zip?: string;

  @ApiProperty({ description: 'Additional address line' })
  addressLine2?: string;
}

// ============================================================================
// SKILLS CONFIGURATION DTOs (EXISTING)
// ============================================================================

// Skills Configuration DTO for nested configuration
export class SkillsConfigurationDto {
  @ApiProperty({ description: 'Enable performance tracking through tasks', required: false })
  @IsOptional()
  @IsBoolean()
  enablePerformanceTracking?: boolean;

  @ApiProperty({ description: 'Enable peer skill reviews', required: false })
  @IsOptional()
  @IsBoolean()
  enablePeerReviews?: boolean;

  @ApiProperty({ description: 'Enable employee self-assessment', required: false })
  @IsOptional()
  @IsBoolean()
  enableSelfAssessment?: boolean;

  @ApiProperty({ description: 'Months before skills decay without use', required: false, minimum: 1, maximum: 60 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(60)
  skillDecayMonths?: number;

  @ApiProperty({ description: 'Require mandatory skills review', required: false })
  @IsOptional()
  @IsBoolean()
  mandatorySkillsReview?: boolean;

  @ApiProperty({ description: 'Frequency of skills review in months', required: false, minimum: 1, maximum: 24 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(24)
  reviewFrequencyMonths?: number;
}

// Enhanced Update Business Skill Configuration DTO
export class UpdateBusinessSkillConfigDto {
  @ApiProperty({ description: 'Business skill requirements', required: false })
  @IsOptional()
  @IsArray()
  skillRequirements?: BusinessSkillRequirement[];

  @ApiProperty({ description: 'Custom skills defined by business', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customSkills?: string[];

  @ApiProperty({ description: 'Auto-infer skills based on industry/role', required: false })
  @IsOptional()
  @IsBoolean()
  autoInferSkills?: boolean;

  @ApiProperty({ description: 'Require manual approval of inferred skills', required: false })
  @IsOptional()
  @IsBoolean()
  requireSkillApproval?: boolean;

  @ApiProperty({ description: 'Advanced skills configuration settings', required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => SkillsConfigurationDto)
  skillsConfiguration?: SkillsConfigurationDto;

  @ApiProperty({ description: 'Department configurations', required: false })
  @IsOptional()
  @IsArray()
  departments?: any[];
}

// Enhanced Business Skill Configuration Response DTO
export class BusinessSkillConfigResponse {
  @ApiProperty({ description: 'Business ID' })
  businessId: string;

  @ApiProperty({ description: 'Business name' })
  name: string;

  @ApiProperty({ description: 'Business industry', enum: BusinessIndustry })
  industry: BusinessIndustry;

  @ApiProperty({ description: 'Business subcategory', enum: BusinessSubCategory })
  subCategory: BusinessSubCategory;

  @ApiProperty({ description: 'Skill requirements', type: [Object] })
  skillRequirements: BusinessSkillRequirement[];

  @ApiProperty({ description: 'Custom skills', type: [String] })
  customSkills: string[];

  @ApiProperty({ description: 'Auto-infer skills setting' })
  autoInferSkills: boolean;

  @ApiProperty({ description: 'Require skill approval setting' })
  requireSkillApproval: boolean;

  @ApiProperty({ description: 'Advanced skills configuration', type: SkillsConfigurationDto })
  skillsConfiguration: SkillsConfigurationDto;

  @ApiProperty({ description: 'Department configurations', type: [Object] })
  departments: any[];
}

// ============================================================================
// SKILL ASSESSMENT DTOs (EXISTING)
// ============================================================================

export class SkillAssessmentFilterDto {
  @ApiProperty({ description: 'Assessment status filter', required: false })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ description: 'Assessment trigger filter', required: false })
  @IsOptional()
  @IsString()
  trigger?: string;

  @ApiProperty({ description: 'Department filter', required: false })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({ description: 'Role filter', required: false })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiProperty({ description: 'Results limit', required: false, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({ description: 'Results offset', required: false, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  offset?: number;

  @ApiProperty({ description: 'Sort field', required: false })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiProperty({ description: 'Sort order', required: false })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}

export class SkillAssessmentItemDto {
  @ApiProperty({ description: 'Skill name' })
  skillName: string;

  @ApiProperty({ description: 'Skill level' })
  level: string;

  @ApiProperty({ description: 'Years of experience', required: false })
  yearsExperience?: number;

  @ApiProperty({ description: 'Skill source' })
  source: string;

  @ApiProperty({ description: 'Confidence level', required: false })
  confidence?: number;

  @ApiProperty({ description: 'Reasoning for skill', required: false })
  reasoning?: string;
}

export class PendingSkillAssessmentResponse {
  @ApiProperty({ description: 'Assessment ID' })
  id: string;

  @ApiProperty({ description: 'Employee name' })
  employeeName: string;

  @ApiProperty({ description: 'Employee email' })
  employeeEmail: string;

  @ApiProperty({ description: 'Employee role' })
  employeeRole: string;

  @ApiProperty({ description: 'Employee department' })
  employeeDepartment: string;

  @ApiProperty({ description: 'Assessment trigger' })
  trigger: string;

  @ApiProperty({ description: 'Assessment status' })
  status: string;

  @ApiProperty({ description: 'Proposed skills', type: [SkillAssessmentItemDto] })
  proposedSkills: SkillAssessmentItemDto[];

  @ApiProperty({ description: 'Created date' })
  createdAt: Date;

  @ApiProperty({ description: 'Due date', required: false })
  dueDate?: Date;

  @ApiProperty({ description: 'Days pending' })
  daysPending: number;
}

export class ApproveSkillAssessmentDto {
  @ApiProperty({ description: 'List of approved skill names' })
  @IsArray()
  @IsString({ each: true })
  approvedSkills: string[];

  @ApiProperty({ description: 'List of rejected skill names', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rejectedSkills?: string[];

  @ApiProperty({ description: 'Review notes', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectSkillAssessmentDto {
  @ApiProperty({ description: 'Rejection reason' })
  @IsString()
  reason: string;
}

export class BulkSkillAssessmentActionDto {
  @ApiProperty({ description: 'List of assessment IDs to process' })
  @IsArray()
  @IsString({ each: true })
  assessmentIds: string[];

  @ApiProperty({ description: 'Action to perform', enum: ['approve', 'reject'] })
  @IsString()
  @IsEnum(['approve', 'reject'])
  action: 'approve' | 'reject';

  @ApiProperty({ description: 'Notes for the action', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SkillAnalyticsResponse {
  @ApiProperty({ description: 'Total number of employees' })
  totalEmployees: number;

  @ApiProperty({ description: 'Average skills per employee' })
  averageSkillsPerEmployee: number;

  @ApiProperty({ description: 'Number of pending assessments' })
  pendingAssessments: number;

  @ApiProperty({ description: 'Number of completed assessments' })
  completedAssessments: number;

  @ApiProperty({ description: 'Number of rejected assessments' })
  rejectedAssessments: number;

  @ApiProperty({ description: 'Top skills with counts', type: Object })
  topSkills: Record<string, number>;

  @ApiProperty({ description: 'Department breakdown', type: Object })
  departmentBreakdown: Record<string, number>;

  @ApiProperty({ description: 'Skill level distribution', type: Object })
  skillLevelDistribution: {
    novice: number;
    intermediate: number;
    advanced: number;
    expert: number;
  };

  @ApiProperty({ description: 'Assessment status breakdown', type: Object })
  assessmentStatusBreakdown: {
    pending: number;
    approved: number;
    rejected: number;
    partiallyApproved: number;
  };

  @ApiProperty({ description: 'Average assessment time in hours' })
  averageAssessmentTime: number;

  @ApiProperty({ description: 'Missing critical skills', type: [String] })
  missingCriticalSkills: string[];
}

// ============================================================================
// BUSINESS CONFIGURATION DTOs (UPDATED WITH ADDRESS)
// ============================================================================

export class UpdateBusinessConfigDto {
  @ApiProperty({ description: 'Business name', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Business email', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ description: 'Business phone', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ description: 'Business type', enum: BusinessType, required: false })
  @IsOptional()
  @IsEnum(BusinessType)
  type?: BusinessType;

  @ApiProperty({ description: 'Business industry', enum: BusinessIndustry, required: false })
  @IsOptional()
  @IsEnum(BusinessIndustry)
  industry?: BusinessIndustry;

  @ApiProperty({ description: 'Business subcategory', enum: BusinessSubCategory, required: false })
  @IsOptional()
  @IsEnum(BusinessSubCategory)
  subCategory?: BusinessSubCategory;

  @ApiProperty({ description: 'Business operation type', enum: BusinessOperationType, required: false })
  @IsOptional()
  @IsEnum(BusinessOperationType)
  operationType?: BusinessOperationType;

  @ApiProperty({ description: 'Business currency', enum: Currency, required: false })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiProperty({ description: 'Tax ID', required: false })
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiProperty({ description: 'VAT number', required: false })
  @IsOptional()
  @IsString()
  vatNumber?: string;

  @ApiProperty({ description: 'Included features', enum: AgentFeatureFlag, isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @IsEnum(AgentFeatureFlag, { each: true })
  includedFeatures?: AgentFeatureFlag[];

  @ApiProperty({ description: 'Allow clock in/out', required: false })
  @IsOptional()
  @IsBoolean()
  allowClockInOut?: boolean;

  @ApiProperty({ description: 'Has app access', required: false })
  @IsOptional()
  @IsBoolean()
  hasAppAccess?: boolean;

  @ApiProperty({ description: 'Allow check in', required: false })
  @IsOptional()
  @IsBoolean()
  allowCheckIn?: boolean;

  @ApiPropertyOptional({ description: 'Business address information' })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @ApiProperty({ description: 'Business metadata', required: false })
  @IsOptional()
  metadata?: Map<string, any>;
}

export class BusinessConfigResponse {
  @ApiProperty({ description: 'Business ID' })
  id: string;

  @ApiProperty({ description: 'Business name' })
  name: string;

  @ApiProperty({ description: 'Business email' })
  email: string;

  @ApiProperty({ description: 'Business phone', required: false })
  phone?: string;

  @ApiProperty({ description: 'Business type', enum: BusinessType })
  type: BusinessType;

  @ApiProperty({ description: 'Business industry', enum: BusinessIndustry })
  industry: BusinessIndustry;

  @ApiProperty({ description: 'Business subcategory', enum: BusinessSubCategory })
  subCategory: BusinessSubCategory;

  @ApiProperty({ description: 'Business operation type', enum: BusinessOperationType })
  operationType: BusinessOperationType;

  @ApiProperty({ description: 'Business currency', enum: Currency })
  currency: Currency;

  @ApiProperty({ description: 'Tax ID', required: false })
  taxId?: string;

  @ApiProperty({ description: 'VAT number', required: false })
  vatNumber?: string;

  @ApiProperty({ description: 'Included features', enum: AgentFeatureFlag, isArray: true })
  includedFeatures: AgentFeatureFlag[];

  @ApiProperty({ description: 'Employee capabilities', type: Object })
  employeeCapabilities: {
    allowClockInOut: boolean;
    hasAppAccess: boolean;
    allowCheckIn: boolean;
  };

  @ApiProperty({ description: 'Subscription information', type: Object })
  subscriptionInfo: {
    status: SubscriptionStatus;
    endDate?: Date;
    details?: any;
  };

  @ApiProperty({ description: 'Department configurations', type: [Object] })
  departments: any[];

  @ApiPropertyOptional({ description: 'Business address', type: AddressResponse })
  address?: AddressResponse;

  @ApiProperty({ description: 'Business metadata' })
  metadata: Map<string, any>;
}

export class ConfigurationOptionsResponse {
  @ApiProperty({ description: 'Available business types', enum: BusinessType, isArray: true })
  businessTypes: BusinessType[];

  @ApiProperty({ description: 'Available industries', enum: BusinessIndustry, isArray: true })
  industries: BusinessIndustry[];

  @ApiProperty({ description: 'Available subcategories', enum: BusinessSubCategory, isArray: true })
  subCategories: BusinessSubCategory[];

  @ApiProperty({ description: 'Available operation types', enum: BusinessOperationType, isArray: true })
  operationTypes: BusinessOperationType[];

  @ApiProperty({ description: 'Available currencies', enum: Currency, isArray: true })
  currencies: Currency[];

  @ApiProperty({ description: 'Available agent features', enum: AgentFeatureFlag, isArray: true })
  agentFeatures: AgentFeatureFlag[];

  @ApiProperty({ description: 'Available subscription statuses', enum: SubscriptionStatus, isArray: true })
  subscriptionStatuses: SubscriptionStatus[];
}