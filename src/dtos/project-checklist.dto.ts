// src/dtos/project-checklist.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { 
  IsString, 
  IsOptional, 
  IsMongoId, 
  MaxLength, 
  MinLength, 
  IsEnum, 
  IsArray,
  IsBoolean,
  IsNumber,
  IsDateString,
  ValidateNested,
  ArrayMinSize,
  Min,
  Max
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { 
  ChecklistType, 
  ChecklistStatus, 
  ChecklistPriority,
  ChecklistItemStatus,
  ChecklistItemPriority
} from '../schemas/project-checklist.schema';

// CHECKLIST DTOs
export class CreateProjectChecklistDto {
  @ApiProperty({
    description: 'Checklist name',
    example: 'Foundation Phase Checklist',
    minLength: 1,
    maxLength: 255
  })
  @IsString()
  @MinLength(1, { message: 'Checklist name cannot be empty' })
  @MaxLength(255, { message: 'Checklist name cannot exceed 255 characters' })
  name: string;

  @ApiPropertyOptional({
    description: 'Checklist description',
    example: 'Tasks required for foundation work completion',
    maxLength: 1000
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Description cannot exceed 1000 characters' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Type of checklist',
    enum: ChecklistType,
    example: ChecklistType.FOUNDATION
  })
  @IsOptional()
  @IsEnum(ChecklistType, { message: 'Invalid checklist type' })
  type?: ChecklistType;

  @ApiPropertyOptional({
    description: 'Checklist priority',
    enum: ChecklistPriority,
    example: ChecklistPriority.HIGH
  })
  @IsOptional()
  @IsEnum(ChecklistPriority, { message: 'Invalid priority level' })
  priority?: ChecklistPriority;

  @ApiPropertyOptional({
    description: 'Due date for checklist completion',
    example: '2025-06-20T00:00:00Z'
  })
  @IsOptional()
  @IsDateString({}, { message: 'Due date must be a valid date' })
  @Transform(({ value }) => new Date(value))
  dueDate?: Date;

  @ApiPropertyOptional({
    description: 'Start date for checklist',
    example: '2025-06-12T00:00:00Z'
  })
  @IsOptional()
  @IsDateString({}, { message: 'Start date must be a valid date' })
  @Transform(({ value }) => new Date(value))
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'User IDs to assign to this checklist',
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true, message: 'Each assigned user ID must be a valid MongoDB ObjectId' })
  assignedUsers?: string[];

  @ApiPropertyOptional({
    description: 'Team IDs to assign to this checklist',
    example: ['team1', 'team2']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedTeams?: string[];

  @ApiPropertyOptional({
    description: 'Template ID if creating from template',
    example: '507f1f77bcf86cd799439013'
  })
  @IsOptional()
  @IsMongoId({ message: 'Template ID must be a valid MongoDB ObjectId' })
  templateId?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata for the checklist'
  })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateProjectChecklistDto {
  @ApiPropertyOptional({
    description: 'Updated checklist name',
    minLength: 1,
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Checklist name cannot be empty' })
  @MaxLength(255, { message: 'Checklist name cannot exceed 255 characters' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated description',
    maxLength: 1000
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Description cannot exceed 1000 characters' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Updated checklist type',
    enum: ChecklistType
  })
  @IsOptional()
  @IsEnum(ChecklistType, { message: 'Invalid checklist type' })
  type?: ChecklistType;

  @ApiPropertyOptional({
    description: 'Updated priority',
    enum: ChecklistPriority
  })
  @IsOptional()
  @IsEnum(ChecklistPriority, { message: 'Invalid priority level' })
  priority?: ChecklistPriority;

  @ApiPropertyOptional({
    description: 'Updated status',
    enum: ChecklistStatus
  })
  @IsOptional()
  @IsEnum(ChecklistStatus, { message: 'Invalid status' })
  status?: ChecklistStatus;

  @ApiPropertyOptional({
    description: 'Updated due date',
    example: '2025-06-25T00:00:00Z'
  })
  @IsOptional()
  @IsDateString({}, { message: 'Due date must be a valid date' })
  @Transform(({ value }) => new Date(value))
  dueDate?: Date;

  @ApiPropertyOptional({
    description: 'Updated start date',
    example: '2025-06-15T00:00:00Z'
  })
  @IsOptional()
  @IsDateString({}, { message: 'Start date must be a valid date' })
  @Transform(({ value }) => new Date(value))
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'Updated assigned users',
    example: ['507f1f77bcf86cd799439011']
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true, message: 'Each assigned user ID must be a valid MongoDB ObjectId' })
  assignedUsers?: string[];

  @ApiPropertyOptional({
    description: 'Updated assigned teams',
    example: ['team1', 'team3']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedTeams?: string[];
}

// CHECKLIST ITEM DTOs
export class CreateChecklistItemDto {
  @ApiProperty({
    description: 'Item name/task',
    example: 'Check foundation level measurements',
    minLength: 1,
    maxLength: 500
  })
  @IsString()
  @MinLength(1, { message: 'Item name cannot be empty' })
  @MaxLength(500, { message: 'Item name cannot exceed 500 characters' })
  name: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the task',
    example: 'Verify all foundation measurements are within tolerance',
    maxLength: 2000
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Description cannot exceed 2000 characters' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Additional notes',
    maxLength: 1000
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Notes cannot exceed 1000 characters' })
  notes?: string;

  @ApiPropertyOptional({
    description: 'Priority level',
    enum: ChecklistItemPriority,
    example: ChecklistItemPriority.HIGH
  })
  @IsOptional()
  @IsEnum(ChecklistItemPriority, { message: 'Invalid priority level' })
  priority?: ChecklistItemPriority;

  @ApiPropertyOptional({
    description: 'User ID to assign this task to',
    example: '507f1f77bcf86cd799439011'
  })
  @IsOptional()
  @IsMongoId({ message: 'Assigned user ID must be a valid MongoDB ObjectId' })
  assignedTo?: string;

  @ApiPropertyOptional({
    description: 'Due date for task completion',
    example: '2025-06-18T00:00:00Z'
  })
  @IsOptional()
  @IsDateString({}, { message: 'Due date must be a valid date' })
  @Transform(({ value }) => new Date(value))
  dueDate?: Date;

  @ApiPropertyOptional({
    description: 'Sort order within checklist',
    minimum: 0
  })
  @IsOptional()
  @IsNumber({}, { message: 'Sort order must be a number' })
  @Min(0, { message: 'Sort order must be non-negative' })
  sortOrder?: number;

  @ApiPropertyOptional({
    description: 'Estimated time in minutes',
    minimum: 1
  })
  @IsOptional()
  @IsNumber({}, { message: 'Estimated minutes must be a number' })
  @Min(1, { message: 'Estimated minutes must be at least 1' })
  estimatedMinutes?: number;

  @ApiPropertyOptional({
    description: 'Other checklist item IDs that must be completed first',
    example: ['507f1f77bcf86cd799439014']
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true, message: 'Each dependency ID must be a valid MongoDB ObjectId' })
  dependencies?: string[];

  @ApiPropertyOptional({
    description: 'Whether this item requires approval after completion',
    example: false
  })
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @ApiPropertyOptional({
    description: 'Additional metadata for the item'
  })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateChecklistItemDto {
  @ApiPropertyOptional({
    description: 'Updated item name',
    minLength: 1,
    maxLength: 500
  })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Item name cannot be empty' })
  @MaxLength(500, { message: 'Item name cannot exceed 500 characters' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated description',
    maxLength: 2000
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Description cannot exceed 2000 characters' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Updated notes',
    maxLength: 1000
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Notes cannot exceed 1000 characters' })
  notes?: string;

  @ApiPropertyOptional({
    description: 'Updated priority',
    enum: ChecklistItemPriority
  })
  @IsOptional()
  @IsEnum(ChecklistItemPriority, { message: 'Invalid priority level' })
  priority?: ChecklistItemPriority;

  @ApiPropertyOptional({
    description: 'Updated status',
    enum: ChecklistItemStatus
  })
  @IsOptional()
  @IsEnum(ChecklistItemStatus, { message: 'Invalid status' })
  status?: ChecklistItemStatus;

  @ApiPropertyOptional({
    description: 'Updated assigned user',
    example: '507f1f77bcf86cd799439012'
  })
  @IsOptional()
  @IsMongoId({ message: 'Assigned user ID must be a valid MongoDB ObjectId' })
  assignedTo?: string;

  @ApiPropertyOptional({
    description: 'Updated due date',
    example: '2025-06-20T00:00:00Z'
  })
  @IsOptional()
  @IsDateString({}, { message: 'Due date must be a valid date' })
  @Transform(({ value }) => new Date(value))
  dueDate?: Date;

  @ApiPropertyOptional({
    description: 'Updated sort order',
    minimum: 0
  })
  @IsOptional()
  @IsNumber({}, { message: 'Sort order must be a number' })
  @Min(0, { message: 'Sort order must be non-negative' })
  sortOrder?: number;

  @ApiPropertyOptional({
    description: 'Updated estimated time in minutes',
    minimum: 1
  })
  @IsOptional()
  @IsNumber({}, { message: 'Estimated minutes must be a number' })
  @Min(1, { message: 'Estimated minutes must be at least 1' })
  estimatedMinutes?: number;

  @ApiPropertyOptional({
    description: 'Updated dependencies',
    example: ['507f1f77bcf86cd799439015']
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true, message: 'Each dependency ID must be a valid MongoDB ObjectId' })
  dependencies?: string[];

  @ApiPropertyOptional({
    description: 'Updated approval requirement',
    example: true
  })
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;
}

export class CompleteChecklistItemDto {
  @ApiPropertyOptional({
    description: 'Completion notes',
    maxLength: 1000
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Completion notes cannot exceed 1000 characters' })
  completionNotes?: string;

  @ApiPropertyOptional({
    description: 'Actual time spent in minutes',
    minimum: 1
  })
  @IsOptional()
  @IsNumber({}, { message: 'Actual minutes must be a number' })
  @Min(1, { message: 'Actual minutes must be at least 1' })
  actualMinutes?: number;
}

export class ApproveChecklistItemDto {
  @ApiPropertyOptional({
    description: 'Approval notes',
    maxLength: 1000
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Approval notes cannot exceed 1000 characters' })
  approvalNotes?: string;
}

export class BulkUpdateChecklistItemsDto {
  @ApiProperty({
    description: 'Array of item IDs to update',
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one item ID must be provided' })
  @IsMongoId({ each: true, message: 'Each item ID must be a valid MongoDB ObjectId' })
  itemIds: string[];

  @ApiPropertyOptional({
    description: 'New status for all items',
    enum: ChecklistItemStatus
  })
  @IsOptional()
  @IsEnum(ChecklistItemStatus, { message: 'Invalid status' })
  status?: ChecklistItemStatus;

  @ApiPropertyOptional({
    description: 'New assigned user for all items',
    example: '507f1f77bcf86cd799439013'
  })
  @IsOptional()
  @IsMongoId({ message: 'Assigned user ID must be a valid MongoDB ObjectId' })
  assignedTo?: string;

  @ApiPropertyOptional({
    description: 'New due date for all items',
    example: '2025-06-22T00:00:00Z'
  })
  @IsOptional()
  @IsDateString({}, { message: 'Due date must be a valid date' })
  @Transform(({ value }) => new Date(value))
  dueDate?: Date;

  @ApiPropertyOptional({
    description: 'New priority for all items',
    enum: ChecklistItemPriority
  })
  @IsOptional()
  @IsEnum(ChecklistItemPriority, { message: 'Invalid priority level' })
  priority?: ChecklistItemPriority;
}

// RESPONSE DTOs
export class ChecklistItemResponseDto {
  @ApiProperty({
    description: 'Checklist item ID',
    example: '507f1f77bcf86cd799439011'
  })
  id: string;

  @ApiProperty({
    description: 'Checklist ID this item belongs to',
    example: '507f1f77bcf86cd799439012'
  })
  checklistId: string;

  @ApiProperty({
    description: 'Project ID',
    example: '507f1f77bcf86cd799439013'
  })
  appProjectId: string;

  @ApiProperty({
    description: 'Item name/task',
    example: 'Check foundation level measurements'
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Item description',
    example: 'Verify all foundation measurements are within tolerance'
  })
  description?: string;

  @ApiPropertyOptional({
    description: 'Additional notes',
    example: 'Use laser level for accuracy'
  })
  notes?: string;

  @ApiProperty({
    description: 'Item status',
    enum: ChecklistItemStatus,
    example: ChecklistItemStatus.PENDING
  })
  status: ChecklistItemStatus;

  @ApiProperty({
    description: 'Item priority',
    enum: ChecklistItemPriority,
    example: ChecklistItemPriority.HIGH
  })
  priority: ChecklistItemPriority;

  @ApiProperty({
    description: 'Whether item is completed',
    example: false
  })
  isCompleted: boolean;

  @ApiPropertyOptional({
    description: 'Assigned user information'
  })
  assignedTo?: {
    id: string;
    name: string;
    email: string;
  };

  @ApiPropertyOptional({
    description: 'User who completed the item'
  })
  completedBy?: {
    id: string;
    name: string;
    email: string;
  };

  @ApiPropertyOptional({
    description: 'When item was completed',
    example: '2025-06-18T14:30:00Z'
  })
  completedAt?: Date;

  @ApiPropertyOptional({
    description: 'Completion notes',
    example: 'All measurements verified and within specs'
  })
  completionNotes?: string;

  @ApiPropertyOptional({
    description: 'Due date for completion',
    example: '2025-06-20T00:00:00Z'
  })
  dueDate?: Date;

  @ApiProperty({
    description: 'Sort order within checklist',
    example: 1
  })
  sortOrder: number;

  @ApiPropertyOptional({
    description: 'Estimated time in minutes',
    example: 30
  })
  estimatedMinutes?: number;

  @ApiPropertyOptional({
    description: 'Actual time spent in minutes',
    example: 45
  })
  actualMinutes?: number;

  @ApiProperty({
    description: 'Dependency item IDs',
    example: ['507f1f77bcf86cd799439014']
  })
  dependencies: string[];

  @ApiProperty({
    description: 'Whether approval is required',
    example: false
  })
  requiresApproval: boolean;

  @ApiPropertyOptional({
    description: 'Approval information'
  })
  approval?: {
    approvedBy: {
      id: string;
      name: string;
      email: string;
    };
    approvedAt: Date;
    approvalNotes?: string;
  };

  @ApiProperty({
    description: 'File attachments',
    example: []
  })
  attachments: Array<{
    url: string;
    name: string;
    size: number;
    mimeType: string;
    uploadedBy: string;
    uploadedAt: Date;
  }>;

  @ApiProperty({
    description: 'Item creation timestamp',
    example: '2025-06-11T10:30:00Z'
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Item last update timestamp',
    example: '2025-06-11T10:35:00Z'
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Whether item is overdue',
    example: false
  })
  isOverdue: boolean;

  @ApiProperty({
    description: 'Whether dependencies are met and item can be started',
    example: true
  })
  canStart: boolean;

  @ApiPropertyOptional({
    description: 'Item metadata'
  })
  metadata?: Record<string, any>;
}

export class ProjectChecklistResponseDto {
  @ApiProperty({
    description: 'Checklist ID',
    example: '507f1f77bcf86cd799439011'
  })
  id: string;

  @ApiProperty({
    description: 'Project ID',
    example: '507f1f77bcf86cd799439012'
  })
  appProjectId: string;

  @ApiProperty({
    description: 'User who created the checklist'
  })
  createdBy: {
    id: string;
    name: string;
    email: string;
  };

  @ApiProperty({
    description: 'Checklist name',
    example: 'Foundation Phase Checklist'
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Checklist description',
    example: 'Tasks required for foundation work completion'
  })
  description?: string;

  @ApiProperty({
    description: 'Checklist type',
    enum: ChecklistType,
    example: ChecklistType.FOUNDATION
  })
  type: ChecklistType;

  @ApiProperty({
    description: 'Checklist status',
    enum: ChecklistStatus,
    example: ChecklistStatus.ACTIVE
  })
  status: ChecklistStatus;

  @ApiProperty({
    description: 'Checklist priority',
    enum: ChecklistPriority,
    example: ChecklistPriority.HIGH
  })
  priority: ChecklistPriority;

  @ApiProperty({
    description: 'Total number of items',
    example: 15
  })
  totalItems: number;

  @ApiProperty({
    description: 'Number of completed items',
    example: 8
  })
  completedItems: number;

  @ApiProperty({
    description: 'Completion percentage',
    example: 53.33
  })
  completionPercentage: number;

  @ApiPropertyOptional({
    description: 'Due date for checklist completion',
    example: '2025-06-20T00:00:00Z'
  })
  dueDate?: Date;

  @ApiPropertyOptional({
    description: 'Start date for checklist',
    example: '2025-06-12T00:00:00Z'
  })
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'When checklist was completed',
    example: '2025-06-19T16:45:00Z'
  })
  completedAt?: Date;

  @ApiProperty({
    description: 'Assigned users',
    example: ['507f1f77bcf86cd799439013', '507f1f77bcf86cd799439014']
  })
  assignedUsers: string[];

  @ApiProperty({
    description: 'Assigned teams',
    example: ['team1', 'team2']
  })
  assignedTeams: string[];

  @ApiProperty({
    description: 'Detailed user assignments'
  })
  userAssignments: Array<{
    userId: string;
    userName: string;
    role?: string;
    assignedAt: Date;
    isActive: boolean;
  }>;

  @ApiProperty({
    description: 'Detailed team assignments'
  })
  teamAssignments: Array<{
    teamId: string;
    teamName: string;
    role?: string;
    assignedAt: Date;
    isActive: boolean;
  }>;

  @ApiPropertyOptional({
    description: 'Template information'
  })
  template?: {
    id: string;
    name: string;
  };

  @ApiProperty({
    description: 'Checklist creation timestamp',
    example: '2025-06-11T10:30:00Z'
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Checklist last update timestamp',
    example: '2025-06-11T10:35:00Z'
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Whether checklist is overdue',
    example: false
  })
  isOverdue: boolean;

  @ApiProperty({
    description: 'Whether checklist is complete',
    example: false
  })
  isComplete: boolean;

  @ApiPropertyOptional({
    description: 'Checklist metadata'
  })
  metadata?: Record<string, any>;
}

export class ProjectChecklistWithItemsResponseDto extends ProjectChecklistResponseDto {
  @ApiProperty({
    description: 'Checklist items',
    type: [ChecklistItemResponseDto]
  })
  items: ChecklistItemResponseDto[];
}

export class ProjectChecklistsListResponseDto {
  @ApiProperty({
    description: 'List of checklists',
    type: [ProjectChecklistResponseDto]
  })
  checklists: ProjectChecklistResponseDto[];

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
    description: 'Summary statistics'
  })
  summary: {
    totalChecklists: number;
    activeChecklists: number;
    completedChecklists: number;
    overdueChecklists: number;
    totalItems: number;
    completedItems: number;
    overallCompletionPercentage: number;
    lastActivityAt?: Date;
  };
}

export class ChecklistItemsListResponseDto {
  @ApiProperty({
    description: 'List of checklist items',
    type: [ChecklistItemResponseDto]
  })
  items: ChecklistItemResponseDto[];

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
    description: 'Items summary'
  })
  summary: {
    totalItems: number;
    completedItems: number;
    pendingItems: number;
    overdueItems: number;
    completionPercentage: number;
    lastCompletionAt?: Date;
  };
}

export class ChecklistActionResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Checklist created successfully'
  })
  message: string;

  @ApiPropertyOptional({
    description: 'Checklist data',
    type: ProjectChecklistResponseDto
  })
  checklist?: ProjectChecklistResponseDto;

  @ApiPropertyOptional({
    description: 'Checklist item data',
    type: ChecklistItemResponseDto
  })
  item?: ChecklistItemResponseDto;
}

export class ProjectChecklistStatsResponseDto {
  @ApiProperty({
    description: 'Total checklists in project',
    example: 12
  })
  totalChecklists: number;

  @ApiProperty({
    description: 'Active checklists',
    example: 8
  })
  activeChecklists: number;

  @ApiProperty({
    description: 'Completed checklists',
    example: 3
  })
  completedChecklists: number;

  @ApiProperty({
    description: 'Overdue checklists',
    example: 1
  })
  overdueChecklists: number;

  @ApiProperty({
    description: 'Total items across all checklists',
    example: 156
  })
  totalItems: number;

  @ApiProperty({
    description: 'Completed items',
    example: 89
  })
  completedItems: number;

  @ApiProperty({
    description: 'Pending items',
    example: 52
  })
  pendingItems: number;

  @ApiProperty({
    description: 'Overdue items',
    example: 15
  })
  overdueItems: number;

  @ApiProperty({
    description: 'Overall completion percentage',
    example: 57.05
  })
  overallCompletionPercentage: number;

  @ApiProperty({
    description: 'Checklists by type'
  })
  checklistsByType: Record<string, number>;

  @ApiProperty({
    description: 'Items by status'
  })
  itemsByStatus: Record<string, number>;

  @ApiProperty({
    description: 'Most active users'
  })
  topPerformers: Array<{
    userId: string;
    userName: string;
    completedItems: number;
    completionRate: number;
  }>;

  @ApiProperty({
    description: 'Completion activity over time'
  })
  completionTrend: Array<{
    date: string;
    itemsCompleted: number;
    checklistsCompleted: number;
  }>;

  @ApiProperty({
    description: 'Average time per item completion (minutes)',
    example: 45.2
  })
  averageCompletionTime: number;

  @ApiProperty({
    description: 'When last item was completed',
    example: '2025-06-11T15:30:00Z'
  })
  lastActivityAt?: Date;
}