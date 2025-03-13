// src/dtos/community-report.dto.ts
import {
    IsNotEmpty,
    IsString,
    IsOptional,
    IsEnum,
    IsObject,
    IsNumber,
    IsBoolean,
    IsArray,
    ValidateNested,
    Min as IsMin
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class LocationDto {
    @ApiProperty({ description: 'Latitude coordinate' })
    @IsNumber()
    lat: number;

    @ApiProperty({ description: 'Longitude coordinate' })
    @IsNumber()
    lng: number;

    @ApiPropertyOptional({ description: 'Location accuracy in meters' })
    @IsOptional()
    @IsNumber()
    accuracy?: number;
}

export class CreateCommunityReportDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    content: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    category: string;

    @ApiProperty({ required: false, default: false })
    @IsOptional()
    @IsBoolean()
    isAnonymous?: boolean = false;

    @ApiProperty({ type: LocationDto })
    @ValidateNested()
    @Type(() => LocationDto)
    location: LocationDto;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    authorId?: string;

    @ApiProperty({ required: false, readOnly: true })
    @IsOptional()
    clientId?: string;

    @ApiProperty({
        enum: ['pending', 'in_progress', 'resolved', 'closed'],
        default: 'pending'
    })
    @IsEnum(['pending', 'in_progress', 'resolved', 'closed'])
    @IsOptional()
    status?: string = 'pending';

     @IsOptional()
    @IsBoolean()
    isFromChatbot?: boolean;

    @ApiProperty({ required: false })
    @IsObject()
    @IsOptional()
    metadata?: Record<string, any>;
}

// Using PartialType from @nestjs/swagger to make all fields optional for updates
export class UpdateCommunityReportDto extends PartialType(CreateCommunityReportDto) {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    override title?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    override content?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    override category?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsBoolean()
    override isAnonymous?: boolean;

    @ApiProperty({ required: false })
    @IsOptional()
    @ValidateNested()
    @Type(() => LocationDto)
    override location?: LocationDto;

    @ApiProperty({
        required: false,
        enum: ['pending', 'in_progress', 'resolved', 'closed']
    })
    @IsOptional()
    @IsEnum(['pending', 'in_progress', 'resolved', 'closed'])
    override status?: string;

    @ApiProperty({ required: false, type: [String] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    media?: string[];

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    audio?: string;
}

export class ListCommunityReportDto {
    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    search?: string;

    @ApiProperty({ required: false, default: 1, minimum: 1 })
    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    @IsMin(1)
    page?: number = 1;

    @ApiProperty({ required: false, default: 10, minimum: 1 })
    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    @IsMin(1)
    limit?: number = 10;

    @ApiProperty({
        required: false,
        enum: ['pending', 'in_progress', 'resolved', 'closed', 'all'],
        default: 'all'
    })
    @IsOptional()
    @IsEnum(['pending', 'in_progress', 'resolved', 'closed', 'all'])
    status?: string = 'all';

    @ApiProperty({
        required: false,
        enum: ['infrastructure', 'safety', 'environment', 'public_services', 'transportation', 'all'],
        default: 'all'
    })
    @IsOptional()
    @IsEnum(['infrastructure', 'safety', 'environment', 'public_services', 'transportation', 'all'])
    category?: string = 'all';

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    clientId?: string;

    @ApiProperty({
        required: false,
        enum: ['title', 'createdAt', 'updatedAt', 'status']
    })
    @IsOptional()
    @IsString()
    sortBy?: string = 'createdAt';

    @ApiProperty({ required: false, enum: ['asc', 'desc'], default: 'desc' })
    @IsOptional()
    @IsEnum(['asc', 'desc'])
    sortOrder?: 'asc' | 'desc' = 'desc';
}