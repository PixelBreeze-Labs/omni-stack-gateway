// src/dtos/project-issue.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, MaxLength, MinLength, IsMongoId, IsDate, IsNumber, Min, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { IssuePriority, IssueStatus, IssueCategory } from '../schemas/project-issue.schema';

export class CreateProjectIssueDto {
  @ApiProperty({
    description: 'Issue title',
    example: 'Water leak in foundation',
    minLength: 5,
    maxLength: 200
  })
  @IsString()
  @MinLength(5, { message: 'Issue title must be at least 5 characters' })
  @MaxLength(200, { message: 'Issue title cannot exceed 200 characters' })
  title: string;

  @ApiProperty({
    description: 'Issue description',
    example: 'Water is leaking through the foundation wall near the north entrance',
    minLength: 10,
    maxLength: 2000
  })
  @IsString()
  @MinLength(10, { message: 'Issue description must be at least 10 characters' })
  @MaxLength(2000, { message: 'Issue description cannot exceed 2000 characters' })
  description: string;

  @ApiProperty({
    description: 'Issue priority level',
    enum: IssuePriority,
    example: IssuePriority.HIGH
  })
  @IsEnum(IssuePriority, { message: 'Invalid priority level' })
  priority: IssuePriority;

  @ApiProperty({
    description: 'Issue category',
    enum: IssueCategory,
    example: IssueCategory.SAFETY
  })
  @IsEnum(IssueCategory, { message: 'Invalid issue category' })
  category: IssueCategory;

  @ApiPropertyOptional({
    description: 'Location where issue occurred',
    example: 'Building A, North entrance, Foundation level',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Location cannot exceed 255 characters' })
  location?: string;

  @ApiPropertyOptional({
    description: 'User ID to assign this issue to',
    example: '507f1f77bcf86cd799439011'
  })
  @IsOptional()
  @IsMongoId({ message: 'Assigned to must be a valid user ID' })
  assignedTo?: string;

  @ApiPropertyOptional({
    description: 'Due date for resolving the issue',
    example: '2025-06-15T10:00:00Z'
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'Due date must be a valid date' })
  dueDate?: Date;

  @ApiPropertyOptional({
    description: 'Estimated cost impact in dollars',
    example: 500.00,
    minimum: 0
  })
  @IsOptional()
  @IsNumber({}, { message: 'Estimated cost must be a number' })
  @Min(0, { message: 'Estimated cost cannot be negative' })
  estimatedCost?: number;

  @ApiPropertyOptional({
    description: 'Estimated time impact in hours',
    example: 8,
    minimum: 0
  })
  @IsOptional()
  @IsNumber({}, { message: 'Time impact must be a number' })
  @Min(0, { message: 'Time impact cannot be negative' })
  timeImpact?: number;

  @ApiPropertyOptional({
    description: 'Tags for the issue',
    example: ['urgent', 'foundation', 'waterproofing'],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Additional metadata',
    example: { contractor: 'ABC Construction', urgentContact: '+1234567890' }
  })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateProjectIssueDto {
  @ApiPropertyOptional({
    description: 'Updated issue title',
    example: 'Updated: Water leak in foundation',
    minLength: 5,
    maxLength: 200
  })
  @IsOptional()
  @IsString()
  @MinLength(5, { message: 'Issue title must be at least 5 characters' })
  @MaxLength(200, { message: 'Issue title cannot exceed 200 characters' })
  title?: string;

  @ApiPropertyOptional({
    description: 'Updated issue description',
    example: 'Updated description with more details',
    minLength: 10,
    maxLength: 2000
  })
  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'Issue description must be at least 10 characters' })
  @MaxLength(2000, { message: 'Issue description cannot exceed 2000 characters' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Updated priority level',
    enum: IssuePriority,
    example: IssuePriority.CRITICAL
  })
  @IsOptional()
  @IsEnum(IssuePriority, { message: 'Invalid priority level' })
  priority?: IssuePriority;

  @ApiPropertyOptional({
    description: 'Updated issue status',
    enum: IssueStatus,
    example: IssueStatus.IN_PROGRESS
  })
  @IsOptional()
  @IsEnum(IssueStatus, { message: 'Invalid issue status' })
  status?: IssueStatus;

  @ApiPropertyOptional({
    description: 'Updated issue category',
    enum: IssueCategory,
    example: IssueCategory.QUALITY
  })
  @IsOptional()
  @IsEnum(IssueCategory, { message: 'Invalid issue category' })
  category?: IssueCategory;

  @ApiPropertyOptional({
    description: 'Updated location',
    example: 'Updated location details',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Location cannot exceed 255 characters' })
  location?: string;

  @ApiPropertyOptional({
    description: 'Updated assigned user ID',
    example: '507f1f77bcf86cd799439012'
  })
  @IsOptional()
  @IsMongoId({ message: 'Assigned to must be a valid user ID' })
  assignedTo?: string;

  @ApiPropertyOptional({
    description: 'Updated due date',
    example: '2025-06-20T10:00:00Z'
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'Due date must be a valid date' })
  dueDate?: Date;

  @ApiPropertyOptional({
    description: 'Resolution notes when resolving/closing issue',
    example: 'Issue resolved by applying waterproof sealant',
    maxLength: 1000
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Resolution notes cannot exceed 1000 characters' })
  resolutionNotes?: string;
}

export class ProjectIssueResponseDto {
  @ApiProperty({
    description: 'Issue ID',
    example: '507f1f77bcf86cd799439011'
  })
  id: string;

  @ApiProperty({
    description: 'Project ID',
    example: '507f1f77bcf86cd799439012'
  })
  appProjectId: string;

  @ApiProperty({
    description: 'Reporter information'
  })
  reporter: {
    id: string;
    name: string;
    email: string;
  };

  @ApiPropertyOptional({
    description: 'Assignee information'
  })
  assignee?: {
    id: string;
    name: string;
    email: string;
  };

  @ApiProperty({
    description: 'Issue title',
    example: 'Water leak in foundation'
  })
  title: string;

  @ApiProperty({
    description: 'Issue description',
    example: 'Water is leaking through the foundation wall'
  })
  description: string;

  @ApiProperty({
    description: 'Issue priority',
    enum: IssuePriority,
    example: IssuePriority.HIGH
  })
  priority: IssuePriority;

  @ApiProperty({
    description: 'Issue status',
    enum: IssueStatus,
    example: IssueStatus.OPEN
  })
  status: IssueStatus;

  @ApiProperty({
    description: 'Issue category',
    enum: IssueCategory,
    example: IssueCategory.SAFETY
  })
  category: IssueCategory;

  @ApiPropertyOptional({
    description: 'Issue location',
    example: 'Building A, North entrance'
  })
  location?: string;

  @ApiProperty({
    description: 'Photo attachments',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        name: { type: 'string' },
        size: { type: 'number' }
      }
    }
  })
  photos: Array<{
    url: string;
    name: string;
    size: number;
  }>;

  @ApiPropertyOptional({
    description: 'Due date for resolution',
    example: '2025-06-15T10:00:00Z'
  })
  dueDate?: Date;

  @ApiPropertyOptional({
    description: 'Resolution date',
    example: '2025-06-14T15:30:00Z'
  })
  resolvedAt?: Date
    

  @ApiPropertyOptional({
    description: 'Resolution notes',
    example: 'Fixed by applying waterproof coating'
  })
  resolutionNotes?: string;

  @ApiProperty({
    description: 'Issue creation timestamp',
    example: '2025-06-11T10:30:00Z'
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Issue last update timestamp',
    example: '2025-06-11T10:35:00Z'
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Number of photo attachments',
    example: 3
  })
  photoCount: number;

  @ApiProperty({
    description: 'Days since issue was reported',
    example: 2
  })
  daysSinceReported: number;

  @ApiProperty({
    description: 'Whether issue is overdue',
    example: false
  })
  isOverdue: boolean;

  @ApiPropertyOptional({
    description: 'Issue metadata',
    example: { estimatedCost: 500, timeImpact: 8, tags: ['urgent'] }
  })
  metadata?: Record<string, any>;
}

export class ProjectIssuesListResponseDto {
  @ApiProperty({
    description: 'List of issues',
    type: [ProjectIssueResponseDto]
  })
  issues: ProjectIssueResponseDto[];

  @ApiProperty({
    description: 'Pagination information'
  })
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };

  @ApiProperty({
    description: 'Issues summary'
  })
  summary: {
    totalIssues: number;
    openIssues: number;
    inProgressIssues: number;
    resolvedIssues: number;
    overdueIssues: number;
    criticalIssues: number;
    priorityCounts: Record<string, number>;
    categoryCounts: Record<string, number>;
    lastReportedAt?: Date;
  };
}

export class IssueActionResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Issue reported successfully'
  })
  message: string;

  @ApiPropertyOptional({
    description: 'Issue data',
    type: ProjectIssueResponseDto
  })
  issue?: ProjectIssueResponseDto;
}