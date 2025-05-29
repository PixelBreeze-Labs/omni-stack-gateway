// src/dtos/business-staff.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============================================================================
// SIMPLE STAFF PROFILE RESPONSE DTO
// ============================================================================

export class SimpleStaffProfileResponse {

  @ApiPropertyOptional({ description: 'Hire date' })
  hireDate?: Date;

  @ApiProperty({ description: 'Performance percentage (0-100)' })
  performance: number;

  @ApiProperty({ description: 'Current workload (number of active tasks)' })
  currentWorkload: number;

  @ApiProperty({ description: 'Average rating (0-5)' })
  averageRating: number;

  @ApiProperty({ description: 'Task completion rate percentage (0-100)' })
  taskCompletionRate: number;

  @ApiProperty({ description: 'Total number of skills' })
  totalSkills: number;

  @ApiProperty({ description: 'Years of total work experience' })
  yearsExperience: number;

  @ApiProperty({ description: 'Start date (same as hire date)' })
  startDate?: Date;
}

// ============================================================================
// FULL STAFF PROFILE RESPONSE DTO
// ============================================================================

export class SkillItemResponse {
  @ApiProperty({ description: 'Skill name' })
  name: string;

  @ApiProperty({ description: 'Skill level', enum: ['novice', 'intermediate', 'advanced', 'expert'] })
  level: string;

  @ApiProperty({ description: 'Years of experience with this skill' })
  yearsExperience: number;

  @ApiProperty({ description: 'Months of experience with this skill' })
  monthsExperience: number;

  @ApiPropertyOptional({ description: 'When skill was last used' })
  lastUsed?: Date;

  @ApiProperty({ description: 'Source of skill data', enum: ['inferred', 'manual', 'self_assessed', 'peer_reviewed', 'performance', 'certified'] })
  source: string;

  @ApiProperty({ description: 'Confidence level (0-100)' })
  confidence: number;

  @ApiProperty({ description: 'Whether skill is verified' })
  verified: boolean;

  @ApiPropertyOptional({ description: 'Who verified the skill' })
  verifiedBy?: string;

  @ApiPropertyOptional({ description: 'When skill was verified' })
  verifiedAt?: Date;

  @ApiProperty({ description: 'Performance rating for this skill (0-5)' })
  performanceRating: number;

  @ApiPropertyOptional({ description: 'Additional notes about the skill' })
  notes?: string;

  @ApiProperty({ type: [String], description: 'Related training completed' })
  trainingCompleted: string[];
}

export class WorkExperienceResponse {
  @ApiProperty({ description: 'Company name' })
  companyName: string;

  @ApiProperty({ description: 'Position/role' })
  position: string;

  @ApiProperty({ description: 'Industry' })
  industry: string;

  @ApiProperty({ description: 'Start date' })
  startDate: Date;

  @ApiPropertyOptional({ description: 'End date (null if current)' })
  endDate?: Date;

  @ApiProperty({ description: 'Duration in months' })
  durationMonths: number;

  @ApiProperty({ description: 'Employment type', enum: ['full_time', 'part_time', 'contract', 'freelance', 'internship', 'volunteer'] })
  type: string;

  @ApiProperty({ type: [String], description: 'Job responsibilities' })
  responsibilities: string[];

  @ApiProperty({ type: [String], description: 'Skills gained in this role' })
  skillsGained: string[];

  @ApiProperty({ type: [String], description: 'Key achievements' })
  achievements: string[];

  @ApiProperty({ description: 'Whether experience is verified' })
  verified: boolean;
}

export class EducationResponse {
  @ApiProperty({ description: 'Educational institution' })
  institution: string;

  @ApiProperty({ description: 'Degree obtained' })
  degree: string;

  @ApiProperty({ description: 'Field of study' })
  field: string;

  @ApiPropertyOptional({ description: 'Graduation year' })
  graduationYear?: number;

  @ApiPropertyOptional({ description: 'GPA' })
  gpa?: number;

  @ApiProperty({ type: [String], description: 'Honors received' })
  honors?: string[];
}

export class TrainingResponse {
  @ApiProperty({ description: 'Training name' })
  name: string;

  @ApiProperty({ description: 'Training provider' })
  provider: string;

  @ApiProperty({ description: 'Completion date' })
  completedDate: Date;

  @ApiPropertyOptional({ description: 'Expiration date' })
  expirationDate?: Date;

  @ApiPropertyOptional({ description: 'Certificate URL' })
  certificateUrl?: string;

  @ApiProperty({ type: [String], description: 'Skills learned' })
  skillsLearned?: string[];
}

export class DevelopmentGoalResponse {
  @ApiProperty({ description: 'Target skill name' })
  skillName: string;

  @ApiProperty({ description: 'Target skill level', enum: ['novice', 'intermediate', 'advanced', 'expert'] })
  targetLevel: string;

  @ApiProperty({ description: 'Target completion date' })
  targetDate: Date;

  @ApiProperty({ description: 'Current progress percentage (0-100)' })
  currentProgress: number;

  @ApiProperty({ description: 'Goal status', enum: ['active', 'completed', 'cancelled'] })
  status: string;

  @ApiProperty({ description: 'Goal milestones' })
  milestones: {
    description: string;
    completed: boolean;
    completedDate?: Date;
  }[];

  @ApiPropertyOptional({ description: 'Who assigned the goal' })
  assignedBy?: string;
}

export class PerformanceHistoryResponse {
  @ApiProperty({ description: 'Skill that was assessed' })
  skillName: string;

  @ApiProperty({ description: 'Assessment date' })
  assessmentDate: Date;

  @ApiProperty({ description: 'Type of assessor', enum: ['manager', 'peer', 'self', 'customer'] })
  assessorType: string;

  @ApiProperty({ description: 'Rating given (1-5)' })
  rating: number;

  @ApiPropertyOptional({ description: 'Assessment notes' })
  notes?: string;

  @ApiPropertyOptional({ description: 'Improvement plan' })
  improvementPlan?: string;
}

export class FullStaffProfileResponse {

  @ApiPropertyOptional({ description: 'Hire date' })
  hireDate?: Date;

  // Experience & Tenure
  @ApiProperty({ description: 'Experience metrics' })
  experienceMetrics: {
    totalWorkExperienceMonths: number;
    currentTenureMonths: number;
    industryExperienceMonths: number;
    yearsExperience: number;
  };

  // Skills & Competencies
  @ApiProperty({ type: [SkillItemResponse], description: 'Detailed skills list' })
  skills: SkillItemResponse[];

  @ApiProperty({ description: 'Skills summary statistics' })
  skillsSummary: {
    totalSkills: number;
    verifiedSkills: number;
    skillsByLevel: {
      novice: number;
      intermediate: number;
      advanced: number;
      expert: number;
    };
    topSkills: {
      name: string;
      level: string;
      performanceRating: number;
      confidence: number;
      yearsExperience: number;
    }[];
  };

  // Work Experience
  @ApiProperty({ type: [WorkExperienceResponse], description: 'Work history' })
  workExperience: WorkExperienceResponse[];

  // Education & Training
  @ApiProperty({ type: [EducationResponse], description: 'Educational background' })
  education: EducationResponse[];

  @ApiProperty({ type: [TrainingResponse], description: 'Training completed' })
  training: TrainingResponse[];

  @ApiProperty({ type: [String], description: 'Certifications held' })
  certifications: string[];

  // Performance & Analytics
  @ApiProperty({ description: 'Performance metrics' })
  performanceMetrics: {
    tasksCompleted: number;
    tasksOnTime: number;
    averageTaskRating: number;
    customerFeedbackScore: number;
    peerRatingAverage: number;
    improvementAreas: string[];
    strengths: string[];
    lastPerformanceReview?: Date;
    nextPerformanceReview?: Date;
  };

  // Current Status
  @ApiProperty({ description: 'Current work status' })
  currentStatus: {
    workload: number;
    averageRating: number;
    taskCompletionRate: number;
    availability?: any;
  };

  // Development & Goals
  @ApiProperty({ type: [DevelopmentGoalResponse], description: 'Development goals' })
  developmentGoals: DevelopmentGoalResponse[];

  @ApiProperty({ type: [PerformanceHistoryResponse], description: 'Performance assessment history' })
  performanceHistory: PerformanceHistoryResponse[];

  // Location & Contact
  @ApiPropertyOptional({ description: 'Location information' })
  location?: any;

  @ApiPropertyOptional({ description: 'User preferences' })
  preferences?: any;

}
