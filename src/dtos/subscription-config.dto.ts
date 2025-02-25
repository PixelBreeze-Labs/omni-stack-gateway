// src/dtos/subscription-config.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Currency } from '../enums/currency.enum';

export class WebhookConfigDto {
    @ApiPropertyOptional({ description: 'Webhook endpoint URL' })
    @IsOptional()
    @IsString()
    endpoint?: string;

    @ApiPropertyOptional({ description: 'Webhook secret (used for signature verification)', format: 'password' })
    @IsOptional()
    @IsString()
    secret?: string;

    @ApiPropertyOptional({ description: 'Is webhook enabled' })
    @IsOptional()
    @IsBoolean()
    enabled?: boolean;

    @ApiPropertyOptional({ description: 'Events to listen for', type: [String] })
    @IsOptional()
    @IsString({ each: true })
    events?: string[];
}

export class StripeAccountDto {
    @ApiPropertyOptional({ description: 'Stripe account ID' })
    @IsOptional()
    @IsString()
    accountId?: string;

    @ApiPropertyOptional({ description: 'Stripe public key' })
    @IsOptional()
    @IsString()
    publicKey?: string;

    @ApiPropertyOptional({ description: 'Stripe secret key', format: 'password' })
    @IsOptional()
    @IsString()
    secretKey?: string;
}

export class TrialConfigDto {
    @ApiPropertyOptional({ description: 'Is trial enabled' })
    @IsOptional()
    @IsBoolean()
    enabled?: boolean;

    @ApiPropertyOptional({ description: 'Trial duration in days', minimum: 0 })
    @IsOptional()
    @IsInt()
    @Min(0)
    durationDays?: number;
}

export class InvoiceSettingsDto {
    @ApiPropertyOptional({ description: 'Should invoices be generated' })
    @IsOptional()
    @IsBoolean()
    generateInvoice?: boolean;

    @ApiPropertyOptional({ description: 'Days until invoice is due', minimum: 0 })
    @IsOptional()
    @IsInt()
    @Min(0)
    daysUntilDue?: number;

    @ApiPropertyOptional({ description: 'Invoice footer text' })
    @IsOptional()
    @IsString()
    footer?: string;
}

export class UpdateSubscriptionConfigDto {
    @ApiPropertyOptional({ description: 'Product prefix for subscription products' })
    @IsOptional()
    @IsString()
    productPrefix?: string;

    @ApiPropertyOptional({ description: 'Default currency', enum: Currency })
    @IsOptional()
    @IsEnum(Currency)
    defaultCurrency?: Currency;

    @ApiPropertyOptional({ description: 'Webhook configuration' })
    @IsOptional()
    @ValidateNested()
    @Type(() => WebhookConfigDto)
    webhook?: WebhookConfigDto;

    @ApiPropertyOptional({ description: 'Stripe account configuration' })
    @IsOptional()
    @ValidateNested()
    @Type(() => StripeAccountDto)
    stripeAccount?: StripeAccountDto;

    @ApiPropertyOptional({ description: 'Trial configuration' })
    @IsOptional()
    @ValidateNested()
    @Type(() => TrialConfigDto)
    trial?: TrialConfigDto;

    @ApiPropertyOptional({ description: 'Invoice settings' })
    @IsOptional()
    @ValidateNested()
    @Type(() => InvoiceSettingsDto)
    invoiceSettings?: InvoiceSettingsDto;
}