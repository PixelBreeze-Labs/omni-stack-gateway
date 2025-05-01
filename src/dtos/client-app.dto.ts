// src/dtos/client-app.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsArray, IsEmail, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor } from 'class-validator';

export class CreateClientAppDto {
    @ApiProperty({ description: 'Client app name' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        enum: ['wordpress', 'react', 'vue', 'other', 'next'],
        description: 'Type of client application'
    })
    @IsEnum(['wordpress', 'react', 'vue', 'other', 'next'])
    type: string;

    @ApiProperty({
        type: [String],
        description: 'List of domains'
    })
    @IsArray()
    @IsString({ each: true })
    domain: string[];

    @ApiProperty({
        required: false,
        description: 'Contact email'
    })
    @IsEmail()
    @IsOptional()
    email?: string;
}

export class UpdateClientAppDto extends PartialType(CreateClientAppDto) {}

export class ListClientAppDto {
    @ApiProperty({ required: false, description: 'Number of items per page', default: 10 })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Type(() => Number)
    limit?: number;

    @ApiProperty({ required: false, description: 'Number of items to skip', default: 0 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Type(() => Number)
    skip?: number;

    @ApiProperty({ required: false, description: 'Page number (alternative to skip)', default: 1 })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Type(() => Number)
    page?: number;

    @ApiProperty({ required: false, description: 'Search term for name or type' })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiProperty({
        enum: ['active', 'inactive'],
        required: false,
        description: 'Filter by app status'
    })
    @IsOptional()
    @IsEnum(['active', 'inactive'])
    status?: string;
    
    @ApiProperty({
        enum: ['wordpress', 'react', 'vue', 'other', 'next'],
        required: false,
        description: 'Filter by app type'
    })
    @IsOptional()
    @IsEnum(['wordpress', 'react', 'vue', 'other', 'next'])
    type?: string;
}

export class ClientAppBrandColorsDto {
    @ApiPropertyOptional({ description: 'Primary color', default: '#2597a4' })
    @IsString()
    @IsHexColor()
    @IsOptional()
    primaryColor?: string;
  
    @ApiPropertyOptional({ description: 'Primary hover color', default: '#1d7a84' })
    @IsString()
    @IsHexColor()
    @IsOptional()
    primaryHoverColor?: string;
  
    @ApiPropertyOptional({ description: 'Secondary color', default: '#0a0a0a' })
    @IsString()
    @IsHexColor()
    @IsOptional()
    secondaryColor?: string;
  
    @ApiPropertyOptional({ description: 'Secondary hover color', default: '#6c757d' })
    @IsString()
    @IsHexColor()
    @IsOptional()
    secondaryHoverColor?: string;
  
    @ApiPropertyOptional({ description: 'Text on primary color', default: '#ffffff' })
    @IsString()
    @IsHexColor()
    @IsOptional()
    textOnPrimaryColor?: string;
  
    @ApiPropertyOptional({ description: 'Text color', default: '#0a0a0a' })
    @IsString()
    @IsHexColor()
    @IsOptional()
    textColor?: string;
  }