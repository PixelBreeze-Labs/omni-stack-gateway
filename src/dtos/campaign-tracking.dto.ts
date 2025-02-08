// src/tracking/dtos/campaign-tracking.dto.ts
import { IsString, IsNotEmpty, IsNumber, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CampaignParamsDto {
    @ApiProperty({ description: 'UTM source (e.g., facebook)' })
    @IsString()
    @IsNotEmpty()
    utmSource: string;

    @ApiProperty({ description: 'UTM medium (e.g., cpc)' })
    @IsString()
    @IsNotEmpty()
    utmMedium: string;

    @ApiProperty({ description: 'UTM campaign name' })
    @IsString()
    @IsNotEmpty()
    utmCampaign: string;

    @ApiProperty({ description: 'UTM content identifier', required: false })
    @IsString()
    @IsOptional()
    utmContent?: string;

    @ApiProperty({ description: 'UTM term (keywords)', required: false })
    @IsString()
    @IsOptional()
    utmTerm?: string;
}

export class TrackViewProductDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    productId: string;

    @ApiProperty({ type: CampaignParamsDto })
    @IsObject()
    @ValidateNested()
    @Type(() => CampaignParamsDto)
    campaignParams: CampaignParamsDto;
}

export class TrackAddToCartDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    productId: string;

    @ApiProperty()
    @IsNumber()
    @IsNotEmpty()
    quantity: number;

    @ApiProperty()
    @IsNumber()
    @IsNotEmpty()
    price: number;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    currency: string;

    @ApiProperty({ type: CampaignParamsDto })
    @IsObject()
    @ValidateNested()
    @Type(() => CampaignParamsDto)
    campaignParams: CampaignParamsDto;
}

export class TrackPurchaseDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    orderId: string;

    @ApiProperty()
    @IsNumber()
    @IsNotEmpty()
    total: number;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    currency: string;

    @ApiProperty({ type: CampaignParamsDto })
    @IsObject()
    @ValidateNested()
    @Type(() => CampaignParamsDto)
    campaignParams: CampaignParamsDto;
}

export class ListCampaignStatsDto {
    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    campaignId?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    utmSource?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    utmCampaign?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    startDate?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    endDate?: string;
}
