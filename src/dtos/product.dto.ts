import { IsString, IsNumber, IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { Currency } from '../enums/currency.enum';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProductDto {
    @ApiProperty({ description: 'Product name' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Unique product code' })
    @IsString()
    code: string;

    @ApiProperty({ description: 'Product price' })
    @IsNumber()
    price: number;

    @ApiProperty({ enum: Currency, description: 'Price currency' })
    @IsEnum(Currency)
    currency: Currency;

    @ApiProperty({ required: false, description: 'Use external exchange rates' })
    @IsBoolean()
    @IsOptional()
    useExternalRates?: boolean;
}