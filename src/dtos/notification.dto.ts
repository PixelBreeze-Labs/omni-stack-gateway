// src/dtos/notification.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, IsEnum, IsMongoId, IsObject } from 'class-validator';
import { NotificationType } from '../schemas/notification.schema';

export class ListNotificationDto {
    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    page?: number;

    @ApiPropertyOptional({ default: 10 })
    @IsOptional()
    limit?: number;

    @ApiPropertyOptional({ default: false })
    @IsOptional()
    @IsBoolean()
    unreadOnly?: boolean;
}

export class CreateNotificationDto {
    @ApiProperty()
    @IsMongoId()
    userId: string;

    @ApiProperty()
    @IsMongoId()
    clientId: string;

    @ApiProperty()
    @IsMongoId()
    reportId: string;

    @ApiProperty({ enum: Object.values(NotificationType) })
    @IsEnum(NotificationType)
    type: NotificationType;

    @ApiProperty()
    @IsString()
    title: string;

    @ApiProperty()
    @IsString()
    message: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsObject()
    data?: Record<string, any>;
}

export class MarkNotificationsReadDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsMongoId({ each: true })
    ids?: string[];

    @ApiPropertyOptional({ default: false })
    @IsOptional()
    @IsBoolean()
    markAll?: boolean;
}