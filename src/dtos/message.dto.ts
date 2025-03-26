// src/dtos/message.dto.ts
import { IsString, IsEnum, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageType } from '../schemas/message.schema';

export class CreateMessageDto {
  @ApiProperty()
  @IsString()
  senderId: string;

  @ApiProperty()
  @IsString()
  chatId: string;

  @ApiProperty()
  @IsString()
  content: string;

  @ApiProperty({ enum: MessageType, default: MessageType.TEXT })
  @IsEnum(MessageType)
  @IsOptional()
  type?: MessageType;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  replyToId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  forwardedFromId?: string;

  @ApiProperty()
  @IsString()
  clientId: string;

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateMessageStatusDto {
  @ApiProperty()
  @IsString()
  userId: string;

  @ApiProperty({ enum: ['delivered', 'read'] })
  @IsEnum(['delivered', 'read'])
  status: 'delivered' | 'read';
}

export class MessageResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  senderId: string;

  @ApiProperty({ required: false })
  sender?: any;  // Will be populated with user object

  @ApiProperty()
  chatId: string;

  @ApiProperty()
  content: string;

  @ApiProperty({ enum: MessageType })
  type: MessageType;

  @ApiProperty({ required: false })
  replyToId?: string;

  @ApiProperty({ required: false })
  replyTo?: any;  // Will be populated with message object

  @ApiProperty({ required: false })
  forwardedFromId?: string;

  @ApiProperty({ type: [Object] })
  readReceipts: any[];

  @ApiProperty()
  clientId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}