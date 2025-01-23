// src/dtos/brand.dto.ts
import {IsNotEmpty, IsObject, IsOptional, IsString} from "class-validator";

export class CreateBrandDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    code: string;

    @IsString()
    @IsNotEmpty()
    clientId: string;
}

export class CreateBrandApiConfigDto {
    @IsString()
    @IsNotEmpty()
    apiKey: string;

    @IsString()
    @IsNotEmpty()
    baseUrl: string;

    @IsObject()
    endpoints: Record<string, string>;

    @IsObject()
    headers: Record<string, string>;

    @IsString()
    @IsOptional()
    refreshToken?: string;
}

export class UpdateBrandApiConfigDto {
    @IsString()
    @IsOptional()
    apiKey?: string;

    @IsString()
    @IsOptional()
    baseUrl?: string;

    @IsObject()
    @IsOptional()
    endpoints?: Record<string, string>;

    @IsObject()
    @IsOptional()
    headers?: Record<string, string>;

    @IsString()
    @IsOptional()
    refreshToken?: string;
}

export class ListBrandDto {
    @IsString()
    @IsOptional()
    search?: string;

    @IsString()
    @IsOptional()
    clientId?: string;
}
