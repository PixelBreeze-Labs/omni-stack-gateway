// dtos/benefit.dto.ts
import { IsString, IsEnum, IsNumber, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BenefitType } from '../schemas/benefit.schema';
import { PartialType } from "@nestjs/mapped-types";

export class BenefitResponse {
    @ApiProperty()
    id: string;

    @ApiProperty()
    name: string;

    @ApiProperty()
    description: string;

    @ApiProperty({
      enum: [
        'DISCOUNT',
        'CASHBACK',
        'POINTS',
        'FREE_SHIPPING',
        'ROOM_UPGRADE',
        'LATE_CHECKOUT',
        'EARLY_CHECKIN',
        'FREE_BREAKFAST'
      ]
    })
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

    @ApiProperty({
      enum: [
        'DISCOUNT',
        'CASHBACK',
        'POINTS',
        'FREE_SHIPPING',
        'ROOM_UPGRADE',
        'LATE_CHECKOUT',
        'EARLY_CHECKIN',
        'FREE_BREAKFAST'
      ]
    })
    type: string;

    @ApiProperty()
    benefitId: string;
}

export class BenefitDto {
    @ApiProperty()
    @IsString()
    name: string;

    @ApiProperty()
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({
      enum: [
        'DISCOUNT',
        'CASHBACK',
        'POINTS',
        'FREE_SHIPPING',
        'ROOM_UPGRADE',
        'LATE_CHECKOUT',
        'EARLY_CHECKIN',
        'FREE_BREAKFAST'
      ]
    })
    @IsEnum([
      'DISCOUNT',
      'CASHBACK',
      'POINTS',
      'FREE_SHIPPING',
      'ROOM_UPGRADE',
      'LATE_CHECKOUT',
      'EARLY_CHECKIN',
      'FREE_BREAKFAST'
    ])
    type: BenefitType;

    @ApiProperty({
      description: 'The value of the benefit. For DISCOUNT: percentage. For POINTS: number of points. ' +
                  'For ROOM_UPGRADE: upgrade level. For LATE_CHECKOUT/EARLY_CHECKIN: hours. ' +
                  'For FREE_BREAKFAST: number of breakfasts included.'
    })
    @IsNumber()
    value: number;

    @ApiProperty()
    @IsBoolean()
    @IsOptional()
    isActive?: boolean;

    @ApiProperty()
    @IsOptional()
    @IsString({ each: true })
    applicableTiers?: string[];

    @ApiProperty()
    @IsOptional()
    @IsNumber()
    minSpend?: number;
}

export class CreateBenefitDto extends BenefitDto {}
export class UpdateBenefitDto extends PartialType(BenefitDto) {}