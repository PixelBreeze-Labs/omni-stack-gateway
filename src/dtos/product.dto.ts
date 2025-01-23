import { IsString, IsNumber, IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { Currency } from '../enums/currency.enum';

export class CreateProductDto {
    @IsString()
    name: string;

    @IsString()
    code: string;

    @IsNumber()
    price: number;

    @IsEnum(Currency)
    currency: Currency;

    @IsBoolean()
    @IsOptional()
    useExternalRates?: boolean;
}