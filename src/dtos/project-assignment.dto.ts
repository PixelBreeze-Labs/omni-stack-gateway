// src/dtos/project-assignment.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject, IsNotEmpty, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AssignUserToProjectDto {
  @ApiProperty({ description: 'User ID to assign to the project' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional({ description: 'Role of the user in the project (e.g., project_manager, team_leader, member)' })
  @IsString()
  @IsOptional()
  role?: string;

  @ApiPropertyOptional({ description: 'Additional metadata for the assignment' })
  @IsObject()
  @IsOptional()
  metadata?: {
    hourlyRate?: number;
    specializations?: string[];
    accessLevel?: string;
    notes?: string;
    [key: string]: any;
  };
}

export class AssignTeamToProjectDto {
  @ApiProperty({ description: 'Team ID to assign to the project' })
  @IsString()
  @IsNotEmpty()
  teamId: string;

  @ApiPropertyOptional({ description: 'Role of the team in the project (e.g., primary, support, specialist)' })
  @IsString()
  @IsOptional()
  role?: string;

  @ApiPropertyOptional({ description: 'Additional metadata for the team assignment' })
  @IsObject()
  @IsOptional()
  metadata?: {
    estimatedHours?: number;
    primaryResponsibilities?: string[];
    notes?: string;
    [key: string]: any;
  };
}

export class UpdateUserAssignmentDto {
  @ApiPropertyOptional({ description: 'Updated role for the user' })
  @IsString()
  @IsOptional()
  role?: string;

  @ApiPropertyOptional({ description: 'Updated metadata for the assignment' })
  @IsObject()
  @IsOptional()
  metadata?: {
    hourlyRate?: number;
    specializations?: string[];
    accessLevel?: string;
    notes?: string;
    [key: string]: any;
  };
}

export class UpdateTeamAssignmentDto {
  @ApiPropertyOptional({ description: 'Updated role for the team' })
  @IsString()
  @IsOptional()
  role?: string;

  @ApiPropertyOptional({ description: 'Updated metadata for the team assignment' })
  @IsObject()
  @IsOptional()
  metadata?: {
    estimatedHours?: number;
    primaryResponsibilities?: string[];
    notes?: string;
    [key: string]: any;
  };
}

export class BulkUserAssignmentDto {
  @ApiProperty({ description: 'User ID' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional({ description: 'Role of the user' })
  @IsString()
  @IsOptional()
  role?: string;

  @ApiPropertyOptional({ description: 'Assignment metadata' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class BulkAssignUsersToProjectDto {
  @ApiProperty({ 
    type: [BulkUserAssignmentDto],
    description: 'Array of user assignments' 
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkUserAssignmentDto)
  userAssignments: BulkUserAssignmentDto[];
}

// Response DTOs
export class UserAssignmentResponseDto {
  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'User full name' })
  userName: string;

  @ApiProperty({ description: 'User email' })
  userEmail: string;

  @ApiPropertyOptional({ description: 'User role in project' })
  role?: string;

  @ApiProperty({ description: 'Assignment date' })
  assignedAt: Date;

  @ApiProperty({ description: 'Whether assignment is active' })
  isActive: boolean;

  @ApiPropertyOptional({ description: 'Assignment metadata' })
  metadata?: Record<string, any>;
}

export class TeamAssignmentResponseDto {
  @ApiProperty({ description: 'Team ID' })
  teamId: string;

  @ApiProperty({ description: 'Team name' })
  teamName: string;

  @ApiPropertyOptional({ description: 'Team role in project' })
  role?: string;

  @ApiProperty({ description: 'Assignment date' })
  assignedAt: Date;

  @ApiProperty({ description: 'Whether assignment is active' })
  isActive: boolean;

  @ApiPropertyOptional({ description: 'Assignment metadata' })
  metadata?: Record<string, any>;
}

export class ProjectAssignmentSummaryDto {
  @ApiProperty({ description: 'Total number of assigned users' })
  totalUsers: number;

  @ApiProperty({ description: 'Total number of assigned teams' })
  totalTeams: number;

  @ApiPropertyOptional({ description: 'Project manager details' })
  projectManager?: UserAssignmentResponseDto;

  @ApiProperty({ 
    type: [UserAssignmentResponseDto],
    description: 'Team leaders assigned to project' 
  })
  teamLeaders: UserAssignmentResponseDto[];

  @ApiProperty({ description: 'Last assignment update date' })
  lastUpdated: Date;
}

export class ProjectAssignmentResponseDto {
  @ApiProperty({ description: 'Project ID' })
  projectId: string;

  @ApiProperty({ 
    type: [UserAssignmentResponseDto],
    description: 'All assigned users' 
  })
  assignedUsers: UserAssignmentResponseDto[];

  @ApiProperty({ 
    type: [TeamAssignmentResponseDto],
    description: 'All assigned teams' 
  })
  assignedTeams: TeamAssignmentResponseDto[];

  @ApiProperty({ 
    type: ProjectAssignmentSummaryDto,
    description: 'Assignment summary' 
  })
  summary: ProjectAssignmentSummaryDto;
}

export class AssignmentStatsResponseDto {
  @ApiProperty({ description: 'Total number of assigned users' })
  totalUsers: number;

  @ApiProperty({ description: 'Total number of assigned teams' })
  totalTeams: number;

  @ApiProperty({ 
    description: 'Breakdown of users by role',
    example: { 'project_manager': 1, 'team_leader': 2, 'member': 5 }
  })
  roleBreakdown: Record<string, number>;

  @ApiProperty({ 
    description: 'Recent assignment activities',
    type: [Object]
  })
  recentAssignments: any[];
}

// Standard API Response Wrappers
export class AssignmentSuccessResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiPropertyOptional({ description: 'Assignment details' })
  assignment?: any;
}

export class AssignmentErrorResponseDto {
  @ApiProperty({ description: 'Error status' })
  success: boolean;

  @ApiProperty({ description: 'Error message' })
  message: string;

  @ApiPropertyOptional({ description: 'Error details' })
  error?: string;
}