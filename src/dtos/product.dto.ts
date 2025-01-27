import { IsString, IsNumber, IsEnum, IsBoolean, IsOptional, IsObject, IsArray } from 'class-validator';
import { Currency } from '../enums/currency.enum';
import { ApiProperty } from '@nestjs/swagger';

export class BaseProductDto {
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

    @ApiProperty({ required: false })
    @IsBoolean()
    @IsOptional()
    hasVariations?: boolean;

    @ApiProperty({ required: false })
    @IsObject()
    @IsOptional()
    dimensions?: {
        weight: number;
        length: number;
        width: number;
        height: number;
    };

    @ApiProperty({ required: false })
    @IsObject()
    @IsOptional()
    translations?: Map<string, string>;

    @ApiProperty({ required: false })
    @IsArray()
    @IsOptional()
    tags?: string[];

    @ApiProperty({ required: false })
    @IsObject()
    @IsOptional()
    parent?: {
        id: string;
        type: string;
    };

    @ApiProperty({ required: false })
    @IsBoolean()
    @IsOptional()
    isFeatured?: boolean;

    @ApiProperty({ required: false })
    @IsBoolean()
    @IsOptional()
    isBestSeller?: boolean;

    @ApiProperty({ required: false })
    @IsNumber()
    @IsOptional()
    menuOrder?: number;
}

export class CreateProductDto extends BaseProductDto {}

export class ProductDto extends BaseProductDto {
    @ApiProperty({ description: 'Product prices in different currencies' })
    prices: Map<Currency, number>;

    @ApiProperty({ enum: Currency, description: 'Default currency for the product' })
    defaultCurrency: Currency;

    @ApiProperty()
    id: string;

    @ApiProperty()
    clientId: string;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;
}

export class UpdateProductDto extends BaseProductDto {
    @ApiProperty({ required: false })
    @IsOptional()
    prices?: Map<Currency, number>;

    @ApiProperty({ required: false, enum: Currency })
    @IsOptional()
    defaultCurrency?: Currency;
}