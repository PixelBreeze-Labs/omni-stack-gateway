// src/dtos/template.dto.ts
import {IsEnum, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString} from "class-validator";

export class CreateTemplateDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsEnum(['simple', 'variation', 'matrix'])
    type: string;

    @IsObject()
    mappings: {
        required: string[];
        optional: string[];
        variations?: {
            identifiers: string[];
            attributes: string[];
        }
    };

    @IsObject()
    validations: {
        [key: string]: {
            type: string;
            rules: any[];
        }
    };

    @IsString()
    @IsOptional()
    description?: string;


    @IsString()
    @IsNotEmpty()
    clientId: string;
}

export class GenerateMatrixDto {
    @IsObject()
    matrix: Record<string, string[]>;

    @IsString()
    @IsOptional()
    skuPrefix?: string;

    @IsNumber()
    @IsOptional()
    defaultPrice?: number;

    @IsNumber()
    @IsOptional()
    defaultStock?: number;
}