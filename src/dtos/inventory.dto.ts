import { IsEnum, IsMongoId, IsNotEmpty, IsNumber, IsString, Min} from "class-validator";
import { ApiProperty } from '@nestjs/swagger';

export class AdjustInventoryDto {
    @ApiProperty({ description: 'Product ID' })
    @IsMongoId()
    productId: string;

    @ApiProperty({ description: 'Warehouse ID' })
    @IsMongoId()
    warehouseId: string;

    @ApiProperty({ description: 'Quantity to adjust', minimum: 0 })
    @IsNumber()
    @Min(0)
    quantity: number;

    @ApiProperty({
        enum: ['add', 'subtract', 'set'],
        description: 'Type of adjustment'
    })
    @IsEnum(['add', 'subtract', 'set'])
    type: string;

    @ApiProperty({ description: 'Reason for adjustment' })
    @IsString()
    @IsNotEmpty()
    reason: string;
}