// src/dtos/warehouse.dto.ts
import {IsMongoId, IsNotEmpty, IsOptional, IsString} from "class-validator";
import {PartialType} from "@nestjs/mapped-types";
import { ApiProperty } from '@nestjs/swagger';

export class CreateWarehouseDto {
    @ApiProperty({ description: 'Warehouse name' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ description: 'Unique warehouse code' })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    address?: string;

    @ApiProperty({ description: 'Client ID' })
    @IsMongoId()
    @IsNotEmpty()
    clientId: string;
}

export class UpdateWarehouseDto extends PartialType(CreateWarehouseDto) {}