// src/dtos/warehouse.dto.ts
import {IsMongoId, IsNotEmpty, IsOptional, IsString} from "class-validator";
import {PartialType} from "@nestjs/mapped-types";

export class CreateWarehouseDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    code: string;

    @IsString()
    @IsOptional()
    address?: string;

    @IsMongoId()
    @IsNotEmpty()
    clientId: string;
}

export class UpdateWarehouseDto extends PartialType(CreateWarehouseDto) {}
