// src/dtos/business-skills.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsBoolean, IsNumber, IsEnum, IsArray, IsOptional, ValidateNested, Min, Max, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';
import { 
  BusinessIndustry, 
  BusinessSubCategory, 
  BusinessOperationType,
  SkillRequirementLevel
} from '../schemas/business.schema';
import { 
  SkillLevel,
  SkillSource
} from '../schemas/staff-profile.schema';
import {
  AssessmentStatus,
  AssessmentTrigger
} from '../schemas/skill-assessment.schema';

import { 
    BusinessType,
    AgentFeatureFlag,
    SubscriptionStatus
  } from '../schemas/business.schema';
import { Currency } from 'src/enums/currency.enum';

// ============================================================================
// SKILL CONFIGURATION DTOs
// ============================================================================

export class DepartmentSkillRequirementDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  requiredSkills: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  optionalSkills: string[];

  @ApiProperty({ 
    type: 'object', 
    description: 'Skill name to weight (1-10) mapping',
    additionalProperties: { type: 'number' }
  })
  skillWeights: Record<string, number>;
}

export class BusinessSkillRequirementDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ enum: SkillRequirementLevel })
  @IsEnum(SkillRequirementLevel)
  level: SkillRequirementLevel;

  @ApiProperty({ enum: ['novice', 'intermediate', 'advanced', 'expert'] })
  @IsEnum(['novice', 'intermediate', 'advanced', 'expert'])
  minimumProficiency: 'novice' | 'intermediate' | 'advanced' | 'expert';

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  applicableRoles: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  customWeight?: number;
}

export class SkillsConfigurationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enablePerformanceTracking?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enablePeerReviews?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enableSelfAssessment?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 60 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(60)
  skillDecayMonths?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mandatorySkillsReview?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(12)
  reviewFrequencyMonths?: number;
}

export class UpdateBusinessSkillConfigDto {
  @ApiPropertyOptional({ enum: BusinessIndustry })
  @IsOptional()
  @IsEnum(BusinessIndustry)
  industry?: BusinessIndustry;

  @ApiPropertyOptional({ enum: BusinessSubCategory })
  @IsOptional()
  @IsEnum(BusinessSubCategory)
  subCategory?: BusinessSubCategory;

  @ApiPropertyOptional({ type: [BusinessSkillRequirementDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BusinessSkillRequirementDto)
  skillRequirements?: BusinessSkillRequirementDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customSkills?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoInferSkills?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireSkillApproval?: boolean;

  @ApiPropertyOptional({ type: SkillsConfigurationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SkillsConfigurationDto)
  skillsConfiguration?: SkillsConfigurationDto;

  @ApiPropertyOptional({ type: [DepartmentSkillRequirementDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DepartmentSkillRequirementDto)
  departments?: DepartmentSkillRequirementDto[];
}

// ============================================================================
// SKILL ASSESSMENT DTOs
// ============================================================================

export class SkillAssessmentItemDto {
  @ApiProperty()
  @IsString()
  skillName: string;

  @ApiProperty({ enum: SkillLevel })
  @IsEnum(SkillLevel)
  level: SkillLevel;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  yearsExperience: number;

  @ApiProperty({ enum: SkillSource })
  @IsEnum(SkillSource)
  source: SkillSource;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  confidence: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reasoning?: string;
}

export class ApproveSkillAssessmentDto {
  @ApiProperty({ type: [String], description: 'Skills to approve' })
  @IsArray()
  @IsString({ each: true })
  approvedSkills: string[];

  @ApiPropertyOptional({ type: [String], description: 'Skills to reject' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rejectedSkills?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectSkillAssessmentDto {
  @ApiProperty()
  @IsString()
  reason: string;

  @ApiPropertyOptional({ type: [String], description: 'Specific skills to reject (leave empty to reject all)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rejectedSkills?: string[];
}

export class BulkSkillAssessmentActionDto {
  @ApiProperty({ type: [String], description: 'Assessment IDs to process' })
  @IsArray()
  @IsString({ each: true })
  assessmentIds: string[];

  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsEnum(['approve', 'reject'])
  action: 'approve' | 'reject';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

export class BusinessSkillConfigResponse {
  @ApiProperty()
  businessId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: BusinessIndustry })
  industry: BusinessIndustry;

  @ApiProperty({ enum: BusinessSubCategory })
  subCategory: BusinessSubCategory;

  @ApiProperty({ type: [BusinessSkillRequirementDto] })
  skillRequirements: BusinessSkillRequirementDto[];

  @ApiProperty({ type: [String] })
  customSkills: string[];

  @ApiProperty()
  autoInferSkills: boolean;

  @ApiProperty()
  requireSkillApproval: boolean;

  @ApiProperty({ type: SkillsConfigurationDto })
  skillsConfiguration: SkillsConfigurationDto;

  @ApiProperty({ type: [DepartmentSkillRequirementDto] })
  departments: DepartmentSkillRequirementDto[];
}

export class PendingSkillAssessmentResponse {
  @ApiProperty()
  id: string;

  @ApiProperty()
  employeeName: string;

  @ApiProperty()
  employeeEmail: string;

  @ApiProperty()
  employeeRole: string;

  @ApiProperty()
  employeeDepartment?: string;

  @ApiProperty({ enum: AssessmentTrigger })
  trigger: AssessmentTrigger;

  @ApiProperty({ enum: AssessmentStatus })
  status: AssessmentStatus;

  @ApiProperty({ type: [SkillAssessmentItemDto] })
  proposedSkills: SkillAssessmentItemDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  dueDate: Date;

  @ApiProperty({ minimum: 0 })
  daysPending: number;
}

export class SkillAnalyticsResponse {
  @ApiProperty()
  totalEmployees: number;

  @ApiProperty()
  averageSkillsPerEmployee: number;

  @ApiProperty()
  pendingAssessments: number;

  @ApiProperty()
  completedAssessments: number;

  @ApiProperty()
  rejectedAssessments: number;

  @ApiProperty({ 
    type: 'object', 
    description: 'Skill name to count mapping',
    additionalProperties: { type: 'number' }
  })
  topSkills: Record<string, number>;

  @ApiProperty({ 
    type: 'object', 
    description: 'Department to employee count mapping',
    additionalProperties: { type: 'number' }
  })
  departmentBreakdown: Record<string, number>;

  @ApiProperty({ 
    type: 'object', 
    description: 'Skill level distribution',
    properties: {
      novice: { type: 'number' },
      intermediate: { type: 'number' },
      advanced: { type: 'number' },
      expert: { type: 'number' }
    }
  })
  skillLevelDistribution: {
    novice: number;
    intermediate: number;
    advanced: number;
    expert: number;
  };

  @ApiProperty({ 
    type: 'object', 
    description: 'Assessment status breakdown',
    properties: {
      pending: { type: 'number' },
      approved: { type: 'number' },
      rejected: { type: 'number' },
      partiallyApproved: { type: 'number' }
    }
  })
  assessmentStatusBreakdown: {
    pending: number;
    approved: number;
    rejected: number;
    partiallyApproved: number;
  };

  @ApiProperty()
  averageAssessmentTime: number; // in hours

  @ApiProperty({ type: [String] })
  missingCriticalSkills: string[];
}

// ============================================================================
// QUERY/FILTER DTOs
// ============================================================================

export class SkillAssessmentFilterDto {
  @ApiPropertyOptional({ enum: AssessmentStatus })
  @IsOptional()
  @IsEnum(AssessmentStatus)
  status?: AssessmentStatus;

  @ApiPropertyOptional({ enum: AssessmentTrigger })
  @IsOptional()
  @IsEnum(AssessmentTrigger)
  trigger?: AssessmentTrigger;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number = 50;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({ enum: ['createdAt', 'dueDate', 'employeeName'] })
  @IsOptional()
  @IsEnum(['createdAt', 'dueDate', 'employeeName'])
  sortBy?: 'createdAt' | 'dueDate' | 'employeeName' = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

// ============================================================================
// BUSINESS CONFIGURATION DTOs
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
  
    @ApiProperty({ description: 'Business phone number', required: false })
    @IsOptional()
    @IsString()
    phone?: string;
  
    @ApiProperty({ 
      description: 'Business type', 
      enum: BusinessType, 
      required: false 
    })
    @IsOptional()
    @IsEnum(BusinessType)
    type?: BusinessType;
  
    @ApiProperty({ 
      description: 'Business industry', 
      enum: BusinessIndustry, 
      required: false 
    })
    @IsOptional()
    @IsEnum(BusinessIndustry)
    industry?: BusinessIndustry;
  
    @ApiProperty({ 
      description: 'Business subcategory', 
      enum: BusinessSubCategory, 
      required: false 
    })
    @IsOptional()
    @IsEnum(BusinessSubCategory)
    subCategory?: BusinessSubCategory;
  
    @ApiProperty({ 
      description: 'Operation type', 
      enum: BusinessOperationType, 
      required: false 
    })
    @IsOptional()
    @IsEnum(BusinessOperationType)
    operationType?: BusinessOperationType;
  
    @ApiProperty({ 
      description: 'Business currency', 
      enum: Currency, 
      required: false 
    })
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
  
    @ApiProperty({ 
      description: 'Agent features to include', 
      enum: AgentFeatureFlag,
      isArray: true,
      required: false 
    })
    @IsOptional()
    @IsArray()
    @IsEnum(AgentFeatureFlag, { each: true })
    includedFeatures?: AgentFeatureFlag[];
  
    @ApiProperty({ description: 'Allow clock in/out', required: false })
    @IsOptional()
    @IsBoolean()
    allow_clockinout?: boolean;
  
    @ApiProperty({ description: 'Has app access', required: false })
    @IsOptional()
    @IsBoolean()
    has_app_access?: boolean;
  
    @ApiProperty({ description: 'Allow check-in', required: false })
    @IsOptional()
    @IsBoolean()
    allow_checkin?: boolean;
  
    @ApiProperty({ description: 'Business departments', required: false })
    @IsOptional()
    @IsArray()
    departments?: {
      name: string;
      requiredSkills: string[];
      optionalSkills: string[];
      skillWeights: Record<string, number>;
    }[];
  
    @ApiProperty({ description: 'Additional metadata', required: false })
    @IsOptional()
    metadata?: Record<string, any>;
  }
  
  export class BusinessConfigResponse {
    @ApiProperty({ description: 'Business ID' })
    id: string;
  
    @ApiProperty({ description: 'Business name' })
    name: string;
  
    @ApiProperty({ description: 'Business email' })
    email: string;
  
    @ApiProperty({ description: 'Business phone' })
    phone?: string;
  
    @ApiProperty({ enum: BusinessType })
    type: BusinessType;
  
    @ApiProperty({ enum: BusinessIndustry })
    industry: BusinessIndustry;
  
    @ApiProperty({ enum: BusinessSubCategory })
    subCategory: BusinessSubCategory;
  
    @ApiProperty({ enum: BusinessOperationType })
    operationType: BusinessOperationType;
  
    @ApiProperty({ enum: Currency })
    currency: Currency;
  
    @ApiProperty({ description: 'Tax ID' })
    taxId?: string;
  
    @ApiProperty({ description: 'VAT number' })
    vatNumber?: string;
  
    @ApiProperty({ enum: AgentFeatureFlag, isArray: true })
    includedFeatures: AgentFeatureFlag[];
  
    @ApiProperty({ description: 'Employee capabilities' })
    employeeCapabilities: {
      allowClockInOut: boolean;
      hasAppAccess: boolean;
      allowCheckIn: boolean;
    };
  
    @ApiProperty({ description: 'Subscription information' })
    subscriptionInfo: {
      status: SubscriptionStatus;
      endDate?: Date;
      details?: any;
    };
  
    @ApiProperty({ description: 'Business departments' })
    departments: {
      name: string;
      requiredSkills: string[];
      optionalSkills: string[];
      skillWeights: Record<string, number>;
    }[];
  
    @ApiProperty({ description: 'Additional metadata' })
    metadata: Record<string, any>;
  
  }
  
  export class ConfigurationOptionsResponse {
    @ApiProperty({ enum: BusinessType, isArray: true })
    businessTypes: BusinessType[];
  
    @ApiProperty({ enum: BusinessIndustry, isArray: true })
    industries: BusinessIndustry[];
  
    @ApiProperty({ enum: BusinessSubCategory, isArray: true })
    subCategories: BusinessSubCategory[];
  
    @ApiProperty({ enum: BusinessOperationType, isArray: true })
    operationTypes: BusinessOperationType[];
  
    @ApiProperty({ enum: Currency, isArray: true })
    currencies: Currency[];
  
    @ApiProperty({ enum: AgentFeatureFlag, isArray: true })
    agentFeatures: AgentFeatureFlag[];
  
    @ApiProperty({ enum: SubscriptionStatus, isArray: true })
    subscriptionStatuses: SubscriptionStatus[];
  }