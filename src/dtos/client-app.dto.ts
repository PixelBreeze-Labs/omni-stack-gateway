// src/dtos/client-app.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsArray, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { ApiProperty } from '@nestjs/swagger';

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
    @ApiProperty({ required: false })
    @IsOptional()
    @Type(() => Number)
    limit?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @Type(() => Number)
    skip?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiProperty({
        enum: ['active', 'inactive'],
        required: false
    })
    @IsOptional()
    @IsEnum(['active', 'inactive'])
    status?: string;
}