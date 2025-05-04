import { IsNotEmpty, IsOptional, IsString, IsEnum, IsMongoId, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { LogType } from '../schemas/log.schema';

export class CreateLogDto {
    @ApiProperty({ description: 'Type of log', enum: LogType })
    @IsEnum(LogType)
    @IsNotEmpty()
    type: LogType;

    @ApiProperty({ description: 'Log message' })
    @IsString()
    @IsNotEmpty()
    message: string;

    @ApiProperty({ description: 'Additional details', required: false })
    @IsObject()
    @IsOptional()
    details?: any;

    @ApiProperty({ description: 'Session ID' })
    @IsString()
    @IsNotEmpty()
    sessionId: string;

    @ApiProperty({ description: 'Client ID', required: false })
    @IsMongoId()
    @IsOptional()
    clientId?: string;

    @ApiProperty({ description: 'Brand ID', required: false })
    @IsMongoId()
    @IsOptional()
    brandId?: string;

    @ApiProperty({ description: 'Generated Image ID', required: false })
    @IsMongoId()
    @IsOptional()
    imageId?: string;

    @ApiProperty({ description: 'API endpoint', required: false })
    @IsString()
    @IsOptional()
    endpoint?: string;

    @ApiProperty({ description: 'Type of action performed', required: false })
    @IsString()
    @IsOptional()
    actionType?: string;
}

export class ListLogsDto {
    @ApiProperty({ description: 'Log type', enum: LogType, required: false })
    @IsEnum(LogType)
    @IsOptional()
    type?: LogType;

    @ApiProperty({ description: 'Client ID', required: false })
    @IsMongoId()
    @IsOptional()
    clientId?: string;

    @ApiProperty({ description: 'Brand ID', required: false })
    @IsMongoId()
    @IsOptional()
    brandId?: string;

    @ApiProperty({ description: 'Session ID', required: false })
    @IsString()
    @IsOptional()
    sessionId?: string;

    @ApiProperty({ description: 'Page number', required: false, default: 1 })
    @Type(() => Number)
    @IsOptional()
    page?: number = 1;

    @ApiProperty({ description: 'Items per page', required: false, default: 50 })
    @Type(() => Number)
    @IsOptional()
    limit?: number = 50;

    @ApiProperty({ description: 'Start date', required: false })
    @Type(() => Date)
    @IsOptional()
    startDate?: Date;

    @ApiProperty({ description: 'End date', required: false })
    @Type(() => Date)
    @IsOptional()
    endDate?: Date;
}