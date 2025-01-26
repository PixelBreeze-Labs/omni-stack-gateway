import {IsArray, IsNumber, IsObject, IsOptional, IsString, ValidateNested} from "class-validator";
import {Type} from "class-transformer";
import {ApiProperty} from "@nestjs/swagger";

export class VariationAttribute {
    @ApiProperty()
    @IsString()
    name: string;

    @ApiProperty({ type: [String] })
    @IsArray()
    @IsString({ each: true })
    values: string[];
}

export class VariationCombination {
    @ApiProperty()
    @IsString()
    sku: string;

    @ApiProperty({
        description: 'Attribute combinations'
    })
    @IsObject()
    attributes: Record<string, string>;

    @ApiProperty({ required: false })
    @IsNumber()
    @IsOptional()
    price?: number;

    @ApiProperty({ required: false })
    @IsNumber()
    @IsOptional()
    stock?: number;
}

export class CreateVariationDto {
    @ApiProperty({ type: [VariationAttribute] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => VariationAttribute)
    attributes: VariationAttribute[];

    @ApiProperty({ type: [VariationCombination] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => VariationCombination)
    combinations: VariationCombination[];
}

