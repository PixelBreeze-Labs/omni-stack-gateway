// src/dtos/template.dto.ts
import {IsEnum, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString} from "class-validator";
import {ApiProperty} from "@nestjs/swagger";

export class CreateTemplateDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        enum: ['simple', 'variation', 'matrix'],
        description: 'Template type'
    })
    @IsEnum(['simple', 'variation', 'matrix'])
    type: string;

    @ApiProperty({
        description: 'Field mappings configuration'
    })
    @IsObject()
    mappings: {
        required: string[];
        optional: string[];
        variations?: {
            identifiers: string[];
            attributes: string[];
        }
    };

    @ApiProperty({
        description: 'Field validation rules'
    })
    @IsObject()
    validations: {
        [key: string]: {
            type: string;
            rules: any[];
        }
    };

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    clientId: string;
}
export class GenerateMatrixDto {
    @ApiProperty({
        description: 'Variation matrix configuration'
    })
    @IsObject()
    matrix: Record<string, string[]>;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    skuPrefix?: string;

    @ApiProperty({ required: false })
    @IsNumber()
    @IsOptional()
    defaultPrice?: number;

    @ApiProperty({ required: false })
    @IsNumber()
    @IsOptional()
    defaultStock?: number;
}