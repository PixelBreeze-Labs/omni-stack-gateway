import { IsString, IsNumber, IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { Currency } from '../enums/currency.enum';
import { ApiProperty } from '@nestjs/swagger';
import {Prop} from "@nestjs/mongoose";

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

    @Prop({ type: Boolean, default: false })
    hasVariations: boolean;

    @Prop({ type: Object })
    dimensions: {
        weight: number;
        length: number;
        width: number;
        height: number;
    };

    @Prop({ type: Map, of: String })
    translations: Map<string, string>;

    @Prop({ type: [String] })
    tags: string[];

    @Prop({ type: Object })
    parent?: {
        id: string;
        type: string;
    };

    @Prop({ type: Boolean, default: false })
    isFeatured: boolean;

    @Prop({ type: Boolean, default: false })
    isBestSeller: boolean;

    @Prop({ type: Number })
    menuOrder: number;
}