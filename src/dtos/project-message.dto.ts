// src/dtos/project-message.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { 
  IsString, 
  IsOptional, 
  IsMongoId, 
  MaxLength, 
  MinLength, 
  IsEnum, 
  IsArray,
  IsBoolean
} from 'class-validator';
import { MessageType, MessageStatus } from '../schemas/project-message.schema';

export class CreateProjectMessageDto {
  @ApiProperty({
    description: 'Message content',
    example: 'Hey team, just wanted to update you on the progress...',
    minLength: 1,
    maxLength: 2000
  })
  @IsString()
  @MinLength(1, { message: 'Message content cannot be empty' })
  @MaxLength(2000, { message: 'Message content cannot exceed 2000 characters' })
  content: string;

  @ApiPropertyOptional({
    description: 'Parent message ID for replies',
    example: '507f1f77bcf86cd799439011'
  })
  @IsOptional()
  @IsMongoId({ message: 'Reply to message ID must be a valid MongoDB ObjectId' })
  replyToMessageId?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata for the message',
    example: { priority: 'high', mentions: ['user1', 'user2'] }
  })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateProjectMessageDto {
  @ApiProperty({
    description: 'Updated message content',
    example: 'Updated: Hey team, just wanted to update you on the progress...',
    minLength: 1,
    maxLength: 2000
  })
  @IsString()
  @MinLength(1, { message: 'Message content cannot be empty' })
  @MaxLength(2000, { message: 'Message content cannot exceed 2000 characters' })
  content: string;

  @ApiPropertyOptional({
    description: 'Reason for editing the message',
    example: 'Fixed typo',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Edit reason cannot exceed 255 characters' })
  editReason?: string;
}

export class UploadProjectMessageFileDto {
  @ApiProperty({
    description: 'Message content to go with the file',
    example: 'Here is the document we discussed',
    minLength: 1,
    maxLength: 2000
  })
  @IsString()
  @MinLength(1, { message: 'Message content cannot be empty' })
  @MaxLength(2000, { message: 'Message content cannot exceed 2000 characters' })
  content: string;

  @ApiPropertyOptional({
    description: 'Parent message ID if this is a reply with file',
    example: '507f1f77bcf86cd799439011'
  })
  @IsOptional()
  @IsMongoId({ message: 'Reply to message ID must be a valid MongoDB ObjectId' })
  replyToMessageId?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata for the message',
    example: { priority: 'high' }
  })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class MarkMessageReadDto {
  @ApiPropertyOptional({
    description: 'Array of message IDs to mark as read',
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true, message: 'Each message ID must be a valid MongoDB ObjectId' })
  messageIds?: string[];
}

export class AddMessageReactionDto {
  @ApiProperty({
    description: 'Reaction emoji or type',
    example: '👍',
    maxLength: 10
  })
  @IsString()
  @MaxLength(10, { message: 'Reaction cannot exceed 10 characters' })
  reaction: string;
}

export class ProjectMessageResponseDto {
  @ApiProperty({
    description: 'Message ID',
    example: '507f1f77bcf86cd799439011'
  })
  id: string;

  @ApiProperty({
    description: 'Project ID',
    example: '507f1f77bcf86cd799439012'
  })
  appProjectId: string;

  @ApiProperty({
    description: 'Sender information'
  })
  sender: {
    id: string;
    name: string;
    email: string;
  };

  @ApiProperty({
    description: 'Message content',
    example: 'Hey team, just wanted to update you on the progress...'
  })
  content: string;

  @ApiProperty({
    description: 'Message type',
    enum: MessageType,
    example: MessageType.TEXT
  })
  messageType: MessageType;

  @ApiProperty({
    description: 'Message status',
    enum: MessageStatus,
    example: MessageStatus.SENT
  })
  status: MessageStatus;

  @ApiPropertyOptional({
    description: 'Parent message ID if this is a reply',
    example: '507f1f77bcf86cd799439013'
  })
  replyToMessageId?: string;

  @ApiProperty({
    description: 'Number of replies to this message',
    example: 2
  })
  replyCount: number;

  @ApiPropertyOptional({
    description: 'File attachment information'
  })
  file?: {
    url: string;
    name: string;
    size: number;
    mimeType: string;
  };

  @ApiProperty({
    description: 'Users who have read this message',
    example: ['507f1f77bcf86cd799439014', '507f1f77bcf86cd799439015']
  })
  readBy: string[];

  @ApiPropertyOptional({
    description: 'When message was first read',
    example: '2025-06-11T10:35:00Z'
  })
  readAt?: Date;

  @ApiPropertyOptional({
    description: 'Message reactions'
  })
  reactions?: Array<{
    userId: string;
    userName: string;
    reaction: string;
    reactedAt: Date;
  }>;

  @ApiPropertyOptional({
    description: 'Edit information if message was edited'
  })
  editInfo?: {
    lastEditedAt: Date;
    editReason?: string;
    isEdited: boolean;
  };

  @ApiPropertyOptional({
    description: 'System message data for automated messages'
  })
  systemMessageData?: {
    action?: string;
    targetUserId?: string;
    targetUserName?: string;
    oldValue?: string;
    newValue?: string;
  };

  @ApiProperty({
    description: 'Message creation timestamp',
    example: '2025-06-11T10:30:00Z'
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Message last update timestamp',
    example: '2025-06-11T10:35:00Z'
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Whether this message is a reply',
    example: false
  })
  isReply: boolean;

  @ApiProperty({
    description: 'Whether this message has a file attachment',
    example: true
  })
  hasFile: boolean;

  @ApiProperty({
    description: 'Whether this is a system-generated message',
    example: false
  })
  isSystemGenerated: boolean;

  @ApiPropertyOptional({
    description: 'Message metadata'
  })
  metadata?: Record<string, any>;
}

export class ProjectMessagesListResponseDto {
  @ApiProperty({
    description: 'List of messages',
    type: [ProjectMessageResponseDto]
  })
  messages: ProjectMessageResponseDto[];

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
    description: 'Chat statistics'
  })
  summary: {
    totalMessages: number;
    totalReplies: number;
    messagesWithFiles: number;
    unreadMessages: number;
    lastMessageAt?: Date;
    activeParticipants: number;
  };
}

export class MessageActionResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Message sent successfully'
  })
  message: string;

  @ApiPropertyOptional({
    description: 'Message data',
    type: ProjectMessageResponseDto
  })
  messageData?: ProjectMessageResponseDto;
}

export class ProjectChatStatsResponseDto {
  @ApiProperty({
    description: 'Total messages in project chat',
    example: 156
  })
  totalMessages: number;

  @ApiProperty({
    description: 'Messages sent today',
    example: 12
  })
  messagesToday: number;

  @ApiProperty({
    description: 'Messages sent this week',
    example: 45
  })
  messagesThisWeek: number;

  @ApiProperty({
    description: 'Total participants in chat',
    example: 8
  })
  totalParticipants: number;

  @ApiProperty({
    description: 'Active participants (sent message in last 7 days)',
    example: 5
  })
  activeParticipants: number;

  @ApiProperty({
    description: 'Messages with file attachments',
    example: 23
  })
  messagesWithFiles: number;

  @ApiProperty({
    description: 'Total file size shared (in MB)',
    example: 145.6
  })
  totalFileSizeMB: number;

  @ApiProperty({
    description: 'Most active participants'
  })
  topParticipants: Array<{
    userId: string;
    userName: string;
    messageCount: number;
    lastMessageAt: Date;
  }>;

  @ApiProperty({
    description: 'Message activity by day for the last 30 days'
  })
  dailyActivity: Array<{
    date: string; // YYYY-MM-DD
    messageCount: number;
  }>;

  @ApiProperty({
    description: 'When the last message was sent',
    example: '2025-06-11T15:30:00Z'
  })
  lastMessageAt?: Date;

  @ApiProperty({
    description: 'Average messages per day',
    example: 8.5
  })
  averageMessagesPerDay: number;
}