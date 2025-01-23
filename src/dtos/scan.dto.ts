// scan.dto.ts
import {IsNumber, IsOptional, IsString} from "class-validator";

export class ScanProductDto {
    @IsString()
    barcode: string;

    @IsString()
    warehouseId: string;

    @IsString()
    @IsOptional()
    locationCode?: string;

    @IsNumber()
    @IsOptional()
    quantity?: number = 1;

    @IsString()
    @IsOptional()
    name?: string;  // For new products
}