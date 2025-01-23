import {IsDateString, IsEnum, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min} from "class-validator";

export class AdjustInventoryDto {
    @IsMongoId()
    productId: string;

    @IsMongoId()
    warehouseId: string;

    @IsNumber()
    @Min(0)
    quantity: number;

    @IsEnum(['add', 'subtract', 'set'])
    type: string;

    @IsString()
    @IsNotEmpty()
    reason: string;
}