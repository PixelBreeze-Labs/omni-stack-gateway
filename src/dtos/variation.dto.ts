import {IsArray, IsNumber, IsObject, IsOptional, IsString, ValidateNested} from "class-validator";
import {Type} from "class-transformer";

export class CreateVariationDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => VariationAttribute)
    attributes: VariationAttribute[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => VariationCombination)
    combinations: VariationCombination[];
}

export class VariationAttribute {
    @IsString()
    name: string;

    @IsArray()
    @IsString({ each: true })
    values: string[];
}

export class VariationCombination {
    @IsString()
    sku: string;

    @IsObject()
    attributes: Record<string, string>;

    @IsNumber()
    @IsOptional()
    price?: number;

    @IsNumber()
    @IsOptional()
    stock?: number;
}