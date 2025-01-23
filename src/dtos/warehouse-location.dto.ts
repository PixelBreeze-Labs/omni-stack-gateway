// src/dtos/warehouse-location.dto.ts
import {IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min} from "class-validator";
import {PartialType} from "@nestjs/mapped-types";
import { ApiProperty } from '@nestjs/swagger';

export class CreateLocationDto {
    @ApiProperty()
    @IsMongoId()
    warehouseId: string;

    @ApiProperty({ description: 'Location code' })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({ minimum: 0, required: false })
    @IsNumber()
    @IsOptional()
    @Min(0)
    capacity?: number;
}

export class UpdateLocationDto extends PartialType(CreateLocationDto) {}