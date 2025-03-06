import {
    IsString,
    IsOptional,
    IsNumber,
    IsEnum,
    IsArray,
    ValidateNested,
    IsDateString,
    IsDate,
    IsBoolean,
    IsObject
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BonusDayDto {
    @ApiProperty()
    @IsString()
    name: string;

    @ApiProperty()
    @Type(() => Date)
    @IsDate()
    date: string;

    @ApiProperty()
    @IsNumber()
    multiplier: number;
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

// New DTO for stay-related configuration
export class EvaluationPeriodDto {
    @ApiPropertyOptional({ description: 'Number of months for tier upgrades', default: 12 })
    @IsNumber()
    @IsOptional()
    upgrade?: number;

    @ApiPropertyOptional({ description: 'Number of months for tier downgrades', default: 6 })
    @IsNumber()
    @IsOptional()
    downgrade?: number;
}

export class StayDefinitionDto {
    @ApiPropertyOptional({ description: 'Minimum nights required to count as a stay', default: 1 })
    @IsNumber()
    @IsOptional()
    minimumNights?: number;

    @ApiPropertyOptional({ description: 'Whether checkout is required to complete a stay', default: true })
    @IsBoolean()
    @IsOptional()
    checkoutRequired?: boolean;
}

export class StayTrackingDto {
    @ApiPropertyOptional({ type: EvaluationPeriodDto })
    @ValidateNested()
    @Type(() => EvaluationPeriodDto)
    @IsOptional()
    evaluationPeriod?: EvaluationPeriodDto;

    @ApiPropertyOptional({
        description: 'Points earned per stay based on tier',
        example: { bronze: 100, silver: 150, gold: 200, platinum: 250 }
    })
    @IsObject()
    @IsOptional()
    pointsPerStay?: Record<string, number>;

    @ApiPropertyOptional({ type: StayDefinitionDto })
    @ValidateNested()
    @Type(() => StayDefinitionDto)
    @IsOptional()
    stayDefinition?: StayDefinitionDto;
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

    // Add the new stay tracking field
    @ApiPropertyOptional({
        type: StayTrackingDto,
        description: 'Accommodation-specific loyalty settings'
    })
    @ValidateNested()
    @Type(() => StayTrackingDto)
    @IsOptional()
    stayTracking?: StayTrackingDto;
}

export class UpdatePointsSystemDto {
    @ApiProperty()
    @ValidateNested()
    @Type(() => EarningPointsDto)
    earningPoints: EarningPointsDto;

    @ApiProperty()
    @ValidateNested()
    @Type(() => RedeemingPointsDto)
    redeemingPoints: RedeemingPointsDto;
}