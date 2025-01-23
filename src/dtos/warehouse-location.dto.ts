// src/dtos/warehouse-location.dto.ts
import {IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min} from "class-validator";
import {PartialType} from "@nestjs/mapped-types";

export class CreateLocationDto {
    @IsMongoId()
    warehouseId: string;

    @IsString()
    @IsNotEmpty()
    code: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsNumber()
    @IsOptional()
    @Min(0)
    capacity?: number;
}

export class UpdateLocationDto extends PartialType(CreateLocationDto) {}
