// src/dtos/social-chat.dto.ts
import { IsString, IsEnum, IsArray, IsOptional, IsObject, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChatType } from '../schemas/social-chat.schema';

export class CreateSocialChatDto {
  @ApiProperty({ enum: ChatType })
  @IsEnum(ChatType)
  type: ChatType;

  @ApiProperty({ type: [String], description: 'Array of user IDs' })
  @IsArray()
  @IsString({ each: true })
  participants: string[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;  // For group chats

  @ApiProperty()
  @IsString()
  clientId: string;

  @ApiPropertyOptional({ type: Object, description: 'Additional metadata' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateSocialChatDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  participants?: string[];

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ type: Object })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}