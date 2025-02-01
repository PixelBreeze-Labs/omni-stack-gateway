import {
    IsString,
    IsOptional,
    IsNumber,
    IsEnum,
    IsArray,
    ValidateNested,
    IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BonusDayDto {
    @ApiProperty()
    @IsString()
    name: string;

    @ApiProperty({ description: 'ISO8601 formatted date string' })
    @IsDateString()
    date: string;

    @ApiPropertyOptional({ default: 2 })
    @IsNumber()
    @IsOptional()
    multiplier?: number;
}

export class EarningPointsDto {
    @ApiProperty({ default: 1 })
    @IsNumber()
    spend: number; // Required in the schema

    @ApiPropertyOptional({ type: [BonusDayDto], default: [] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BonusDayDto)
    @IsOptional()
    bonusDays?: BonusDayDto[];

    @ApiPropertyOptional({ default: 50 })
    @IsNumber()
    @IsOptional()
    signUpBonus?: number;

    @ApiPropertyOptional({ default: 10 })
    @IsNumber()
    @IsOptional()
    reviewPoints?: number;

    @ApiPropertyOptional({ default: 5 })
    @IsNumber()
    @IsOptional()
    socialSharePoints?: number;
}

export class RedeemingPointsDto {
    @ApiPropertyOptional({ default: 100 })
    @IsNumber()
    @IsOptional()
    pointsPerDiscount?: number;

    @ApiPropertyOptional({ default: 5 })
    @IsNumber()
    @IsOptional()
    discountValue?: number;

    @ApiPropertyOptional({ enum: ['fixed', 'percentage'], default: 'fixed' })
    @IsEnum(['fixed', 'percentage'])
    @IsOptional()
    discountType?: 'fixed' | 'percentage';

    @ApiPropertyOptional({ type: [String], default: [] })
    @IsArray()
    @IsOptional()
    exclusiveRewards?: string[];
}

export class MembershipTierDto {
    @ApiProperty()
    @IsString()
    name: string;

    @ApiProperty()
    spendRange: { min: number; max: number };

    @ApiProperty()
    @IsNumber()
    pointsMultiplier: number;

    @ApiProperty()
    @IsNumber()
    birthdayReward: number;

    @ApiPropertyOptional({ type: [String], default: [] })
    @IsArray()
    @IsOptional()
    perks?: string[];

    @ApiProperty()
    @IsNumber()
    referralPoints: number;
}

export class PointsSystemDto {
    @ApiProperty({ type: EarningPointsDto, default: {} })
    @ValidateNested()
    @Type(() => EarningPointsDto)
    earningPoints: EarningPointsDto;

    @ApiProperty({ type: RedeemingPointsDto, default: {} })
    @ValidateNested()
    @Type(() => RedeemingPointsDto)
    redeemingPoints: RedeemingPointsDto;
}

export class UpdateLoyaltyProgramDto {
    @ApiPropertyOptional({ default: '' })
    @IsString()
    @IsOptional()
    programName?: string;

    @ApiPropertyOptional({ default: 'EUR' })
    @IsString()
    @IsOptional()
    currency?: string;

    @ApiPropertyOptional({ type: PointsSystemDto, default: {} })
    @ValidateNested()
    @Type(() => PointsSystemDto)
    @IsOptional()
    pointsSystem?: PointsSystemDto;

    @ApiPropertyOptional({ type: [MembershipTierDto], default: [] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MembershipTierDto)
    @IsOptional()
    membershipTiers?: MembershipTierDto[];
}
