// src/dtos/client-app.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsArray, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

export class CreateClientAppDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsEnum(['wordpress', 'react', 'vue', 'other', 'next'])
    type: string;

    @IsArray()
    @IsString({ each: true })
    domain: string[];

    @IsEmail()
    @IsOptional()
    email?: string;
}

export class UpdateClientAppDto extends PartialType(CreateClientAppDto) {}

export class ListClientAppDto {
    @IsOptional()
    @Type(() => Number)
    limit?: number;

    @IsOptional()
    @Type(() => Number)
    skip?: number;

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsEnum(['active', 'inactive'])
    status?: string;
}