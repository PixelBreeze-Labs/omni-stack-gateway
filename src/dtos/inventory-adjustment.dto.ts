// src/dto/inventory-adjustment.dto.ts
import {IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min} from "class-validator";
import {Type} from "class-transformer";

export class CreateAdjustmentDto {
    @IsString()
    @IsNotEmpty()
    productId: string;

    @IsString()
    @IsNotEmpty()
    warehouseId: string;

    @IsNumber()
    @Min(0)
    quantity: number;

    @IsEnum(['INCREASE', 'DECREASE', 'SET'])
    type: string;

    @IsString()
    @IsNotEmpty()
    reason: string;

    @IsString()
    @IsNotEmpty()
    category: string;

    @IsString()
    initiatedBy: string;
}

export class ListAdjustmentsDto {
    @IsOptional()
    @IsEnum(['PENDING', 'APPROVED', 'COMPLETED', 'REJECTED'])
    status?: string;

    @IsOptional()
    @IsString()
    warehouseId?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    limit?: number;
}
