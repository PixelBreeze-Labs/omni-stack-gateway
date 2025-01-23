// scan.dto.ts
import {IsNumber, IsOptional, IsString} from "class-validator";
import { ApiProperty } from '@nestjs/swagger';

export class ScanProductDto {
    @ApiProperty({ description: 'Product barcode' })
    @IsString()
    barcode: string;

    @ApiProperty({ description: 'Warehouse ID' })
    @IsString()
    warehouseId: string;

    @ApiProperty({ required: false, description: 'Location code in warehouse' })
    @IsString()
    @IsOptional()
    locationCode?: string;

    @ApiProperty({ required: false, default: 1, description: 'Scan quantity' })
    @IsNumber()
    @IsOptional()
    quantity?: number = 1;

    @ApiProperty({ required: false, description: 'Product name for new products' })
    @IsString()
    @IsOptional()
    name?: string;
}