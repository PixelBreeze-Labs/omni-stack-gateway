// dtos/benefit.dto.ts
import { IsString, IsEnum, IsNumber, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BenefitType } from '../schemas/benefit.schema';

export class BenefitResponse {
    @ApiProperty()
    id: string;

    @ApiProperty()
    name: string;

    @ApiProperty()
    description: string;

    @ApiProperty({ enum: ['DISCOUNT', 'CASHBACK', 'POINTS', 'FREE_SHIPPING'] })
    type: string;

    @ApiProperty()
    value: number;

    @ApiProperty()
    isActive: boolean;
}

export class BenefitUsageResponse {
    @ApiProperty()
    name: string;

    @ApiProperty()
    usageCount: number;

    @ApiProperty()
    savings: number;

    @ApiProperty({ enum: ['DISCOUNT', 'CASHBACK', 'POINTS', 'FREE_SHIPPING'] })
    type: string;

    @ApiProperty()
    benefitId: string;
}

export class CreateBenefitDto {
    @ApiProperty()
    @IsString()
    name: string;

    @ApiProperty()
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({ enum: ['DISCOUNT', 'CASHBACK', 'POINTS', 'FREE_SHIPPING'] })
    @IsEnum(['DISCOUNT', 'CASHBACK', 'POINTS', 'FREE_SHIPPING'])
    type: BenefitType;

    @ApiProperty()
    @IsNumber()
    value: number;
}

export class UpdateBenefitDto {
    @ApiProperty()
    @IsString()
    @IsOptional()
    name?: string;

    @ApiProperty()
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({ enum: ['DISCOUNT', 'CASHBACK', 'POINTS', 'FREE_SHIPPING'] })
    @IsEnum(['DISCOUNT', 'CASHBACK', 'POINTS', 'FREE_SHIPPING'])
    @IsOptional()
    type?: BenefitType;

    @ApiProperty()
    @IsNumber()
    @IsOptional()
    value?: number;

    @ApiProperty()
    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}