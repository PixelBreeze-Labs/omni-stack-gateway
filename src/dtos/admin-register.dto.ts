// src/dtos/admin-register.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, IsEnum, IsOptional, IsBoolean, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export class AddressDto {
    @ApiPropertyOptional({ description: 'Street address' })
    @IsString()
    @IsOptional()
    street?: string;

    @ApiPropertyOptional({ description: 'City' })
    @IsString()
    @IsOptional()
    city?: string;

    @ApiPropertyOptional({ description: 'State or province' })
    @IsString()
    @IsOptional()
    state?: string;

    @ApiPropertyOptional({ description: 'Postal/ZIP code' })
    @IsString()
    @IsOptional()
    zip?: string;

    @ApiPropertyOptional({ description: 'Country' })
    @IsString()
    @IsOptional()
    country?: string;
}

export class SubscriptionDto {
    @ApiProperty({ description: 'Stripe price ID for the subscription plan' })
    @IsString()
    planId: string;

    @ApiProperty({ description: 'Subscription interval', enum: ['month', 'year'] })
    @IsEnum(['month', 'year'])
    interval: 'month' | 'year';
}

export class AdminRegisterDto {
    @ApiProperty({ description: 'Business name' })
    @IsString()
    businessName: string;

    @ApiProperty({ description: 'Business email address' })
    @IsEmail()
    businessEmail: string;

    @ApiProperty({ description: 'Business type', example: 'RESTAURANT' })
    @IsString()
    businessType: string;

    @ApiProperty({ description: 'Full name of the admin user' })
    @IsString()
    fullName: string;

    @ApiPropertyOptional({ description: 'Business phone number' })
    @IsString()
    @IsOptional()
    phone?: string;

    @ApiPropertyOptional({ description: 'Business address' })
    @IsObject()
    @ValidateNested()
    @Type(() => AddressDto)
    @IsOptional()
    address?: AddressDto;

    @ApiProperty({ description: 'Subscription details' })
    @ValidateNested()
    @Type(() => SubscriptionDto)
    subscription: SubscriptionDto;

    @ApiPropertyOptional({ description: 'Whether to automatically verify the email', default: true })
    @IsBoolean()
    @IsOptional()
    autoVerifyEmail?: boolean;

    @ApiPropertyOptional({ description: 'Whether to send a welcome email', default: true })
    @IsBoolean()
    @IsOptional()
    sendWelcomeEmail?: boolean;
}