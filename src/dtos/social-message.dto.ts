// src/dtos/social-message.dto.ts
import { IsString, IsEnum, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageType } from '../schemas/social-message.schema';

export class CreateSocialMessageDto {
  @ApiPropertyOptional()  // Changed to optional since controller sets it
  @IsString()
  @IsOptional()  // Added IsOptional
  senderId?: string;

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

  @ApiPropertyOptional()  // Changed to optional
  @IsString()
  @IsOptional()  // Added IsOptional
  clientId?: string;

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