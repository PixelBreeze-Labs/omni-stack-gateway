// src/dtos/project-comment.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsMongoId, MaxLength, MinLength, IsEnum, IsArray } from 'class-validator';
import { CommentType } from '../schemas/project-comment.schema';

export class CreateProjectCommentDto {
  @ApiProperty({
    description: 'Comment content',
    example: 'Great progress on the foundation work!',
    minLength: 1,
    maxLength: 2000
  })
  @IsString()
  @MinLength(1, { message: 'Comment content cannot be empty' })
  @MaxLength(2000, { message: 'Comment content cannot exceed 2000 characters' })
  content: string;

  @ApiPropertyOptional({
    description: 'Parent comment ID for replies',
    example: '507f1f77bcf86cd799439011'
  })
  @IsOptional()
  @IsMongoId({ message: 'Parent comment ID must be a valid MongoDB ObjectId' })
  parentCommentId?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata for the comment',
    example: { isAdminComment: true }
  })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateProjectCommentDto {
  @ApiProperty({
    description: 'Updated comment content',
    example: 'Updated: Great progress on the foundation work!',
    minLength: 1,
    maxLength: 2000
  })
  @IsString()
  @MinLength(1, { message: 'Comment content cannot be empty' })
  @MaxLength(2000, { message: 'Comment content cannot exceed 2000 characters' })
  content: string;

  @ApiPropertyOptional({
    description: 'Reason for editing the comment',
    example: 'Fixed typo',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Edit reason cannot exceed 255 characters' })
  editReason?: string;
}

export class ProjectCommentResponseDto {
  @ApiProperty({
    description: 'Comment ID',
    example: '507f1f77bcf86cd799439011'
  })
  id: string;

  @ApiProperty({
    description: 'Project ID',
    example: '507f1f77bcf86cd799439012'
  })
  appProjectId: string;

  @ApiProperty({
    description: 'Author information'
  })
  author: {
    id: string;
    name: string;
    email: string;
  };

  @ApiProperty({
    description: 'Comment content',
    example: 'Great progress on the foundation work!'
  })
  content: string;

  @ApiProperty({
    description: 'Comment type',
    enum: CommentType,
    example: CommentType.TEXT
  })
  commentType: CommentType;

  @ApiPropertyOptional({
    description: 'Parent comment ID if this is a reply',
    example: '507f1f77bcf86cd799439013'
  })
  parentCommentId?: string;

  @ApiProperty({
    description: 'Number of replies to this comment',
    example: 3
  })
  replyCount: number;

  @ApiPropertyOptional({
    description: 'Image attachment information'
  })
  image?: {
    url: string;
    name: string;
    size: number;
  };

  @ApiPropertyOptional({
    description: 'Edit information if comment was edited'
  })
  editInfo?: {
    lastEditedAt: Date;
    editReason?: string;
  };

  @ApiProperty({
    description: 'Comment creation timestamp',
    example: '2025-06-11T10:30:00Z'
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Comment last update timestamp',
    example: '2025-06-11T10:35:00Z'
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Whether this comment is a reply',
    example: false
  })
  isReply: boolean;

  @ApiProperty({
    description: 'Whether this comment has an image',
    example: true
  })
  hasImage: boolean;

  @ApiPropertyOptional({
    description: 'Comment metadata',
    example: { isAdminComment: true }
  })
  metadata?: Record<string, any>;
}

export class ProjectCommentsListResponseDto {
  @ApiProperty({
    description: 'List of comments',
    type: [ProjectCommentResponseDto]
  })
  comments: ProjectCommentResponseDto[];

  @ApiProperty({
    description: 'Pagination and summary information'
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
    description: 'Comments summary'
  })
  summary: {
    totalComments: number;
    totalReplies: number;
    commentsWithImages: number;
    lastCommentAt?: Date;
  };
}

export class CommentActionResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Comment created successfully'
  })
  message: string;

  @ApiPropertyOptional({
    description: 'Comment data',
    type: ProjectCommentResponseDto
  })
  comment?: ProjectCommentResponseDto;
}

export class UploadCommentImageDto {
  @ApiProperty({
    description: 'Comment content to go with the image',
    example: 'Here is a photo of the completed work',
    minLength: 1,
    maxLength: 2000
  })
  @IsString()
  @MinLength(1, { message: 'Comment content cannot be empty' })
  @MaxLength(2000, { message: 'Comment content cannot exceed 2000 characters' })
  content: string;

  @ApiPropertyOptional({
    description: 'Parent comment ID for image replies',
    example: '507f1f77bcf86cd799439011'
  })
  @IsOptional()
  @IsMongoId({ message: 'Parent comment ID must be a valid MongoDB ObjectId' })
  parentCommentId?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata for the comment',
    example: { isAdminComment: true }
  })
  @IsOptional()
  metadata?: Record<string, any>;
}